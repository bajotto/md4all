import { CODE_EXTS, collectPaths, readFile, writeFile, remove } from './vault'
import { addUsage, chat, chatJson, emptyUsage, getModels, type ChatMessage } from './llm'
import { verifyFindings } from './grounding'
import { collectRepoFacts, renderFactsBlock } from './repoFacts'
import type {
  AgentsContext,
  AnalysisReport,
  AnalyzeResult,
  ApplyResult,
  AuditReport,
  Finding,
  FindingKind,
  LlmUsage,
  ReviewOutcome,
  ReviewResult,
  Severity
} from './types'

const DOC_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])

/** Caminho é de documentação? (trava de segurança: nunca tocar código no apply) */
function isDocPath(p: string): boolean {
  const i = p.lastIndexOf('.')
  return i !== -1 && DOC_EXTS.has(p.slice(i).toLowerCase())
}

// orçamento de contexto (caracteres ~ 4 chars/token)
const PER_FILE_MAX = 16_000
const TOTAL_MAX = 360_000

export type Progress = (msg: string, pct?: number) => void

interface FileBlob {
  path: string
  content: string
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n…[truncado: ${s.length - max} caracteres omitidos]`
}

async function collectBlobs(
  vaultId: string,
  exts: Set<string>,
  perFileMax: number
): Promise<FileBlob[]> {
  const paths = await collectPaths(vaultId, exts)
  const blobs: FileBlob[] = []
  for (const p of paths) {
    try {
      const content = await readFile(vaultId, p)
      blobs.push({ path: p, content: truncate(content, perFileMax) })
    } catch {
      /* arquivo ilegível: ignora */
    }
  }
  return blobs
}

export async function collectDocs(vaultId: string): Promise<FileBlob[]> {
  return collectBlobs(vaultId, DOC_EXTS, PER_FILE_MAX)
}

export async function collectCode(vaultId: string): Promise<FileBlob[]> {
  return collectBlobs(vaultId, CODE_EXTS, PER_FILE_MAX)
}

function renderBlobs(blobs: FileBlob[]): string {
  return blobs.map((b) => `### ${b.path}\n\`\`\`\n${b.content}\n\`\`\``).join('\n\n')
}

// ---------------- prompts (anti-alucinação, foco em instruir LLMs) ----------------

const SYSTEM_DOC = `Você é um arquiteto de documentação técnica especializado em produzir docs que SERVEM PARA INSTRUIR OUTRAS LLMs sobre um codebase, com máxima precisão e zero alucinação.

Princípios inegociáveis:
- NUNCA invente APIs, arquivos, funções, comandos, flags ou comportamentos. Toda afirmação técnica deve ser rastreável ao CÓDIGO fornecido.
- Quando algo não puder ser confirmado no código, marque explicitamente como "não verificado" em vez de afirmar.
- Escreva de forma objetiva, sem floreio, sem ambiguidade, sem marketing. Frases curtas e diretas.
- Cite caminhos reais do repositório como âncora factual (ex.: src/main/ipc.ts), e referências a linha quando souber (path:linha).
- Estrutura canônica por documento: Propósito · Escopo · Pontos de entrada (com paths) · Invariantes/contratos · Exemplos verificáveis · Pegadinhas conhecidas.
- Prefira poucos documentos coesos a muitos fragmentados; elimine duplicação; resolva contradições de forma factual com base no código.
- O conteúdo gerado deve reduzir alucinação de LLMs futuras: explícito sobre o que é garantido vs. o que é suposição.`

function buildAnalysisUserMessage(docs: FileBlob[], code: FileBlob[]): string {
  return `Abaixo está a DOCUMENTAÇÃO atual (.md/.txt) e o CÓDIGO-FONTE do mesmo repositório.

Tarefas:
1. Entenda o contexto de toda a documentação.
2. Avalie a documentação entre si: coesão, contradições e repetições.
3. Cruze a documentação com o código real e aponte divergências (doc afirma algo que o código não confirma).
4. Proponha uma nova ESTRUTURA de documentação otimizada para instruir LLMs sem alucinação, seguindo os princípios do sistema.

Responda APENAS com um objeto JSON com exatamente este formato:
{
  "coherence": [string],        // observações sobre coesão geral
  "contradictions": [string],   // contradições entre documentos
  "duplications": [string],     // conteúdos repetidos/redundantes
  "codeMismatches": [ { "doc": string, "claim": string, "evidence": "path:linha ou descrição" } ],
  "proposedTree": [ { "path": "pasta/arquivo.md", "content": "markdown completo", "rationale": "por que", "status": "created|updated|unchanged|removed" } ]
}

Regras do proposedTree (CRÍTICAS):
- proposedTree contém SOMENTE arquivos de DOCUMENTAÇÃO (.md). NUNCA inclua arquivos de código-fonte (.ts, .js, .py, etc.) — o código é apenas referência para você verificar a doc.
- CORRIJA o conteúdo: todo documento com contradição, divergência doc↔código ou duplicação deve vir com status "updated" e o "content" já reescrito de forma factual e correta (baseado no código real). Só use "unchanged" para documentos genuinamente corretos e sem redundância.
- Liste TODO o conjunto final de documentos (inclua os "unchanged" com seu conteúdo atual).
- Use "removed" (content vazio) para documentos atuais que devem deixar de existir (ex.: duplicados absorvidos por outro).
- "content" deve ser markdown final, pronto para gravar, sem placeholders.

=== DOCUMENTAÇÃO ATUAL ===
${docs.length ? renderBlobs(docs) : '(nenhum documento encontrado)'}

=== CÓDIGO-FONTE ===
${code.length ? renderBlobs(code) : '(nenhum arquivo de código encontrado)'}`
}

/** Resume um arquivo de código num parágrafo factual (usado quando o contexto estoura). */
async function summarizeCode(model: string, blob: FileBlob, acc: LlmUsage): Promise<FileBlob> {
  try {
    const { content, usage } = await chat(
      model,
      [
        { role: 'system', content: 'Resuma o arquivo em até 6 linhas factuais: exportações públicas, responsabilidades e contratos. Sem inventar.' },
        { role: 'user', content: `Arquivo ${blob.path}:\n\n${blob.content}` }
      ],
      { temperature: 0, maxTokens: 400 }
    )
    addUsage(acc, usage)
    return { path: blob.path, content }
  } catch {
    return { path: blob.path, content: truncate(blob.content, 2000) }
  }
}

async function fitContext(
  model: string,
  docs: FileBlob[],
  code: FileBlob[],
  onProgress: Progress,
  acc: LlmUsage
): Promise<{ docs: FileBlob[]; code: FileBlob[] }> {
  const size = (bs: FileBlob[]): number => bs.reduce((n, b) => n + b.content.length, 0)
  if (size(docs) + size(code) <= TOTAL_MAX) return { docs, code }

  onProgress('Contexto grande: resumindo arquivos de código…', 30)
  // resume o código em paralelo (concorrência limitada)
  const summarized: FileBlob[] = []
  const CONC = 4
  for (let i = 0; i < code.length; i += CONC) {
    const batch = code.slice(i, i + CONC)
    summarized.push(...(await Promise.all(batch.map((b) => summarizeCode(model, b, acc)))))
  }
  return { docs, code: summarized }
}

// ---------------- análise ----------------
export async function analyze(vaultId: string, onProgress: Progress = () => {}): Promise<AnalyzeResult> {
  const { primary } = getModels()
  const usage = emptyUsage()
  onProgress('Lendo documentação do vault…', 5)
  const docs = await collectDocs(vaultId)
  onProgress('Lendo código-fonte do vault…', 15)
  const code = await collectCode(vaultId)

  const fitted = await fitContext(primary, docs, code, onProgress, usage)

  onProgress('Analisando coesão, contradições e doc↔código…', 50)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_DOC },
    { role: 'user', content: buildAnalysisUserMessage(fitted.docs, fitted.code) }
  ]
  const { value: report, usage: u } = await chatJson<AnalysisReport>(primary, messages, {
    temperature: 0.2,
    maxTokens: 16_000
  })
  addUsage(usage, u)

  // normaliza: garante arrays e tipos corretos (o modelo pode devolver formatos imprevistos)
  const toStrArray = (v: unknown): string[] =>
    (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) =>
      typeof x === 'string' ? x : JSON.stringify(x)
    )
  const clean: AnalysisReport = {
    coherence: toStrArray(report.coherence),
    contradictions: toStrArray(report.contradictions),
    duplications: toStrArray(report.duplications),
    codeMismatches: (Array.isArray(report.codeMismatches) ? report.codeMismatches : []).map((m) => ({
      doc: String((m as { doc?: unknown })?.doc ?? ''),
      claim: String((m as { claim?: unknown })?.claim ?? ''),
      evidence: String((m as { evidence?: unknown })?.evidence ?? '')
    })),
    proposedTree: (Array.isArray(report.proposedTree) ? report.proposedTree : [])
      .filter((f) => f && typeof f.path === 'string' && isDocPath(f.path))
      .map((f) => ({
        path: f.path,
        content: typeof f.content === 'string' ? f.content : String(f.content ?? ''),
        rationale: typeof f.rationale === 'string' ? f.rationale : String(f.rationale ?? ''),
        status: (['created', 'updated', 'unchanged', 'removed'] as const).includes(
          f.status as never
        )
          ? f.status
          : 'updated'
      }))
  }
  onProgress('Análise concluída.', 70)
  return { report: clean, usage, stats: { docCount: docs.length, codeCount: code.length } }
}

// ---------------- revisão de fallback (2ª LLM) ----------------
export async function reviewProposal(
  vaultId: string,
  report: AnalysisReport,
  onProgress: Progress = () => {}
): Promise<ReviewOutcome> {
  const { reviewer } = getModels()
  const usage = emptyUsage()
  onProgress('Revisão de fallback (2ª LLM)…', 80)
  const code = await collectCode(vaultId)
  const fitted = await fitContext(reviewer, [], code, onProgress, usage)

  const proposal = report.proposedTree
    .filter((f) => f.status !== 'removed')
    .map((f) => `### ${f.path} (${f.status})\n${f.content}`)
    .join('\n\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Você é um revisor adversarial. Sua função é PEGAR alucinações e imprecisões. Verifique se a documentação proposta afirma algo que o código não confirma ou que é tecnicamente incorreto. Seja cético.'
    },
    {
      role: 'user',
      content: `Compare a DOCUMENTAÇÃO PROPOSTA com o CÓDIGO. Responda APENAS JSON:
{ "approved": boolean, "blocking": [string], "notes": [string] }
- "blocking": problemas que IMPEDEM aplicar (afirmações falsas/alucinadas, contradição com o código).
- "notes": observações menores.
- "approved" = true somente se "blocking" estiver vazio.

=== DOCUMENTAÇÃO PROPOSTA ===
${proposal || '(vazia)'}

=== CÓDIGO-FONTE ===
${fitted.code.length ? renderBlobs(fitted.code) : '(nenhum)'}`
    }
  ]
  const { value: result, usage: u } = await chatJson<ReviewResult>(reviewer, messages, {
    temperature: 0,
    maxTokens: 4_000
  })
  addUsage(usage, u)
  const review: ReviewResult = {
    blocking: Array.isArray(result.blocking) ? result.blocking.map((x) => String(x)) : [],
    notes: Array.isArray(result.notes) ? result.notes.map((x) => String(x)) : [],
    approved: false
  }
  review.approved = review.blocking.length === 0
  onProgress('Revisão concluída.', 95)
  return { review, usage }
}

// ================= AUDITORIA GROUNDED (findings com âncoras) =================

const SYSTEM_AUDIT = `Você é um auditor de documentação técnica. Seu trabalho é encontrar problemas REAIS na documentação cruzando-a com o código-fonte, com ZERO alucinação.

Regras inegociáveis:
- Todo achado (finding) DEVE vir com ao menos uma âncora: { path, quote } onde "quote" é um TRECHO LITERAL copiado exatamente do código fornecido (e não da doc). Sem âncora literal verificável, NÃO reporte o achado.
- Não invente arquivos, símbolos ou linhas. Se não houver evidência no código, não afirme.
- Foque em problemas que prejudicam quem (humano ou LLM) usa a doc: divergência doc↔código, contradição entre docs, duplicação, doc obsoleta, e API pública sem documentação.
- Seja específico e objetivo. "claim" descreve o problema; "suggestedFix" diz a correção factual.`

function buildAuditUserMessage(docs: FileBlob[], code: FileBlob[]): string {
  return `Audite a DOCUMENTAÇÃO contra o CÓDIGO. Responda APENAS com JSON:
{
  "findings": [
    {
      "kind": "doc_code_mismatch | contradiction | duplication | undocumented | stale",
      "severity": "high | medium | low",
      "doc": "caminho/do/arquivo.md ou null",
      "claim": "descrição objetiva do problema",
      "anchors": [ { "path": "src/...", "quote": "TRECHO LITERAL do código", "symbol": "opcional", "line": 0 } ],
      "suggestedFix": "correção factual sugerida"
    }
  ]
}
Lembre: cada finding precisa de pelo menos uma âncora cujo "quote" seja copiado LITERALMENTE do código abaixo. Findings sem âncora literal serão descartados.

=== DOCUMENTAÇÃO ATUAL ===
${docs.length ? renderBlobs(docs) : '(nenhum documento encontrado)'}

=== CÓDIGO-FONTE ===
${code.length ? renderBlobs(code) : '(nenhum arquivo de código encontrado)'}`
}

const FINDING_KINDS: FindingKind[] = [
  'doc_code_mismatch',
  'contradiction',
  'duplication',
  'undocumented',
  'stale'
]
const SEVERITIES: Severity[] = ['high', 'medium', 'low']

function normalizeFindings(raw: unknown): Finding[] {
  const arr = Array.isArray((raw as { findings?: unknown })?.findings)
    ? (raw as { findings: unknown[] }).findings
    : []
  return arr.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>
    const anchors = Array.isArray(o.anchors)
      ? o.anchors
          .map((a) => {
            const x = (a ?? {}) as Record<string, unknown>
            return {
              path: String(x.path ?? ''),
              quote: String(x.quote ?? ''),
              symbol: x.symbol != null ? String(x.symbol) : undefined,
              line: typeof x.line === 'number' ? x.line : undefined
            }
          })
          .filter((a) => a.path)
      : []
    return {
      id: `f${i + 1}`,
      kind: FINDING_KINDS.includes(o.kind as FindingKind) ? (o.kind as FindingKind) : 'doc_code_mismatch',
      severity: SEVERITIES.includes(o.severity as Severity) ? (o.severity as Severity) : 'medium',
      doc: o.doc != null && o.doc !== 'null' ? String(o.doc) : null,
      claim: String(o.claim ?? ''),
      anchors,
      suggestedFix: String(o.suggestedFix ?? ''),
      verify: 'unverified' as const
    }
  })
}

/** Revisão adversarial: o revisor tenta REFUTAR cada finding citando o código. */
async function reviewFindings(
  reviewer: string,
  findings: Finding[],
  code: FileBlob[],
  usage: LlmUsage
): Promise<Finding[]> {
  // só vale refutar o que foi verificado por âncora
  const toReview = findings.filter((f) => f.verify === 'verified')
  if (!toReview.length) return findings

  const list = toReview
    .map((f) => `- id ${f.id}: ${f.claim}\n  âncoras: ${f.anchors.map((a) => `${a.path} «${a.quote.slice(0, 80)}»`).join(' | ')}`)
    .join('\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Você é um revisor adversarial cético. Para cada finding, tente REFUTÁ-LO consultando o código. Refute (refuted=true) apenas se o código CONTRADIZ o finding ou se a âncora não sustenta a afirmação. Na dúvida, refuted=false.'
    },
    {
      role: 'user',
      content: `Para cada finding abaixo, responda se ele se sustenta no código. JSON APENAS:
{ "verdicts": [ { "id": "f1", "refuted": false, "citation": "path:linha ou trecho que justifica" } ] }

=== FINDINGS ===
${list}

=== CÓDIGO-FONTE ===
${code.length ? renderBlobs(code) : '(nenhum)'}`
    }
  ]
  const { value, usage: u } = await chatJson<{ verdicts?: unknown[] }>(reviewer, messages, {
    temperature: 0,
    maxTokens: 4_000
  })
  addUsage(usage, u)
  const verdicts = new Map<string, { refuted: boolean; citation: string }>()
  for (const v of Array.isArray(value?.verdicts) ? value.verdicts : []) {
    const o = (v ?? {}) as Record<string, unknown>
    if (o.id) verdicts.set(String(o.id), { refuted: o.refuted === true, citation: String(o.citation ?? '') })
  }
  return findings.map((f) => {
    const v = verdicts.get(f.id)
    if (v?.refuted) return { ...f, verify: 'refuted' as const, refutation: v.citation }
    return f
  })
}

const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

export async function audit(vaultId: string, onProgress: Progress = () => {}): Promise<AuditReport> {
  const { primary, reviewer } = getModels()
  const usage = emptyUsage()
  onProgress('Lendo documentação do vault…', 5)
  const docs = await collectDocs(vaultId)
  onProgress('Lendo código-fonte do vault…', 15)
  const code = await collectCode(vaultId)
  const fitted = await fitContext(primary, docs, code, onProgress, usage)

  onProgress('Auditando doc↔código…', 45)
  const { value, usage: u } = await chatJson<{ findings?: unknown[] }>(
    primary,
    [
      { role: 'system', content: SYSTEM_AUDIT },
      { role: 'user', content: buildAuditUserMessage(fitted.docs, fitted.code) }
    ],
    { temperature: 0.1, maxTokens: 12_000 }
  )
  addUsage(usage, u)
  let findings = normalizeFindings(value)

  onProgress('Verificando âncoras no código…', 65)
  findings = await verifyFindings(vaultId, findings)

  onProgress('Revisão adversarial (2ª LLM refuta)…', 80)
  findings = await reviewFindings(reviewer, findings, fitted.code, usage)

  // ordena por severidade depois por estado de verificação
  const stateRank = (s: Finding['verify']): number => (s === 'verified' ? 0 : s === 'unverified' ? 1 : 2)
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || stateRank(a.verify) - stateRank(b.verify))

  const stats = {
    docCount: docs.length,
    codeCount: code.length,
    verified: findings.filter((f) => f.verify === 'verified').length,
    unverified: findings.filter((f) => f.verify === 'unverified').length,
    refuted: findings.filter((f) => f.verify === 'refuted').length
  }
  onProgress('Auditoria concluída.', 100)
  return { findings, usage, stats }
}

// ================= GERADOR DE AGENTS.md (fatos + camada curada) =================

const SYSTEM_AGENTS = `Você escreve um arquivo AGENTS.md: contexto conciso para um agente de código (LLM) trabalhar neste repositório com segurança e sem alucinar.

Regras:
- Use APENAS o que está no código fornecido e nos fatos extraídos. NÃO invente.
- Cada afirmação não-óbvia deve terminar com uma âncora entre colchetes: [src: caminho/arquivo]. Use caminhos reais do repositório.
- Seções: Visão geral · Arquitetura (camadas e responsabilidades, com paths) · Convenções · Invariantes/contratos · Pegadinhas conhecidas.
- Objetivo, curto, sem marketing. Não repita o bloco de fatos determinísticos (ele será concatenado à parte).`

export async function generateAgentsContext(
  vaultId: string,
  targetPath = 'AGENTS.md',
  onProgress: Progress = () => {}
): Promise<AgentsContext> {
  const { primary } = getModels()
  const usage = emptyUsage()

  onProgress('Extraindo fatos determinísticos do repositório…', 10)
  const facts = await collectRepoFacts(vaultId)
  const factsBlock = renderFactsBlock(facts)

  onProgress('Lendo código-fonte…', 30)
  const code = await collectCode(vaultId)
  const fitted = await fitContext(primary, [], code, onProgress, usage)

  onProgress('Gerando camada curada (com âncoras)…', 60)
  const { content: curated, usage: u } = await chat(
    primary,
    [
      { role: 'system', content: SYSTEM_AGENTS },
      {
        role: 'user',
        content: `Fatos já extraídos (NÃO repita, apenas use como referência):\n${factsBlock}\n\n=== CÓDIGO-FONTE ===\n${fitted.code.length ? renderBlobs(fitted.code) : '(nenhum)'}\n\nEscreva a camada curada do AGENTS.md em markdown (sem repetir os fatos).`
      }
    ],
    { temperature: 0.2, maxTokens: 6_000 }
  )
  addUsage(usage, u)

  const content = `${factsBlock}\n\n<!-- CAMADA CURADA (gerada por LLM, com âncoras [src: …]) -->\n\n${curated.trim()}\n`
  onProgress('Contexto do agente gerado.', 100)
  return { content, targetPath, usage, factCount: facts.count }
}

// ---------------- aplicação: backup + merge incremental ----------------
function backupDirName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `_backup_${ts}`
}

/** Grava o AGENTS.md, fazendo backup do anterior se existir. */
export async function applyAgents(
  vaultId: string,
  targetPath: string,
  content: string
): Promise<{ backup?: string; path: string }> {
  let backup: string | undefined
  try {
    const prev = await readFile(vaultId, targetPath)
    backup = `${backupDirName()}/${targetPath}`
    await writeFile(vaultId, backup, prev)
  } catch {
    /* não existia: sem backup */
  }
  await writeFile(vaultId, targetPath, content)
  return { backup, path: targetPath }
}

// ================= EXPORT / IMPORT PARA LLM EXTERNA =================

/**
 * Grava o prompt de auditoria num arquivo de texto no vault.
 * O usuário cola o conteúdo na LLM externa e importa o JSON de resposta.
 */
export async function buildAuditPromptExport(vaultId: string): Promise<string> {
  const docs = await collectDocs(vaultId)
  const code = await collectCode(vaultId)
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const content = [
    '<!-- PROMPT DE AUDITORIA gerado pelo md4all -->',
    '<!-- 1. Copie TODO este texto e cole no chat da sua LLM (ex.: Claude.ai, ChatGPT). -->',
    '<!-- 2. A LLM retornará um JSON. Salve-o como arquivo .json. -->',
    '<!-- 3. Importe o .json em md4all via "Importar resultado". -->',
    '',
    '=== INSTRUÇÃO DO SISTEMA ===',
    SYSTEM_AUDIT,
    '',
    '=== MENSAGEM ===',
    buildAuditUserMessage(docs, code)
  ].join('\n')
  const path = `docs/_prompt_audit_${ts}.txt`
  await writeFile(vaultId, path, content)
  return path
}

/** Grava o prompt de análise/reescrita num arquivo de texto no vault. */
export async function buildAnalyzePromptExport(vaultId: string): Promise<string> {
  const docs = await collectDocs(vaultId)
  const code = await collectCode(vaultId)
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const content = [
    '<!-- PROMPT DE ANÁLISE gerado pelo md4all -->',
    '<!-- 1. Copie TODO este texto e cole no chat da sua LLM (ex.: Claude.ai, ChatGPT). -->',
    '<!-- 2. A LLM retornará um JSON. Salve-o como arquivo .json. -->',
    '<!-- 3. Importe o .json em md4all via "Importar resultado". -->',
    '',
    '=== INSTRUÇÃO DO SISTEMA ===',
    SYSTEM_DOC,
    '',
    '=== MENSAGEM ===',
    buildAnalysisUserMessage(docs, code)
  ].join('\n')
  const path = `docs/_prompt_analyze_${ts}.txt`
  await writeFile(vaultId, path, content)
  return path
}

/** Processa o JSON retornado por LLM externa para auditoria (normalize + verify, sem chamar LLM). */
export async function processImportedAudit(vaultId: string, rawJson: string): Promise<AuditReport> {
  const parsed = JSON.parse(rawJson) as unknown
  let findings = normalizeFindings(parsed)
  findings = await verifyFindings(vaultId, findings)
  const stateRank = (s: Finding['verify']): number => (s === 'verified' ? 0 : s === 'unverified' ? 1 : 2)
  findings.sort(
    (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || stateRank(a.verify) - stateRank(b.verify)
  )
  const stats = {
    docCount: 0,
    codeCount: 0,
    verified: findings.filter((f) => f.verify === 'verified').length,
    unverified: findings.filter((f) => f.verify === 'unverified').length,
    refuted: findings.filter((f) => f.verify === 'refuted').length
  }
  return { findings, usage: emptyUsage(), stats }
}

/** Processa o JSON retornado por LLM externa para análise/reescrita. */
export function processImportedAnalyze(rawJson: string): AnalyzeResult {
  const parsed = JSON.parse(rawJson) as AnalysisReport
  const toStrArray = (v: unknown): string[] =>
    (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) =>
      typeof x === 'string' ? x : JSON.stringify(x)
    )
  const clean: AnalysisReport = {
    coherence: toStrArray(parsed.coherence),
    contradictions: toStrArray(parsed.contradictions),
    duplications: toStrArray(parsed.duplications),
    codeMismatches: (Array.isArray(parsed.codeMismatches) ? parsed.codeMismatches : []).map((m) => ({
      doc: String((m as { doc?: unknown })?.doc ?? ''),
      claim: String((m as { claim?: unknown })?.claim ?? ''),
      evidence: String((m as { evidence?: unknown })?.evidence ?? '')
    })),
    proposedTree: (Array.isArray(parsed.proposedTree) ? parsed.proposedTree : [])
      .filter((f) => f && typeof f.path === 'string' && isDocPath(f.path))
      .map((f) => ({
        path: f.path,
        content: typeof f.content === 'string' ? f.content : String(f.content ?? ''),
        rationale: typeof f.rationale === 'string' ? f.rationale : String(f.rationale ?? ''),
        status: (['created', 'updated', 'unchanged', 'removed'] as const).includes(f.status as never)
          ? f.status
          : 'updated'
      }))
  }
  return { report: clean, usage: emptyUsage(), stats: { docCount: 0, codeCount: 0 } }
}

export async function applyProposal(
  vaultId: string,
  report: AnalysisReport,
  onProgress: Progress = () => {}
): Promise<ApplyResult> {
  const backupDir = backupDirName()
  onProgress('Criando backup da documentação atual…', 10)

  // 1) snapshot completo da documentação atual para a pasta de backup (cópia)
  const currentDocs = await collectPaths(vaultId, DOC_EXTS)
  for (const p of currentDocs) {
    try {
      const content = await readFile(vaultId, p)
      await writeFile(vaultId, `${backupDir}/${p}`, content)
    } catch {
      /* ignora arquivo que falhar ao copiar */
    }
  }

  // 2) merge incremental conforme status
  const created: string[] = []
  const updated: string[] = []
  const removed: string[] = []
  const total = report.proposedTree.length || 1
  let i = 0
  for (const file of report.proposedTree) {
    i++
    // trava de segurança: o apply só mexe em arquivos de documentação, jamais em código
    if (!isDocPath(file.path)) continue
    onProgress(`Aplicando ${file.path}…`, 10 + Math.round((i / total) * 80))
    try {
      if (file.status === 'removed') {
        await remove(vaultId, file.path)
        removed.push(file.path)
      } else if (file.status === 'created') {
        await writeFile(vaultId, file.path, file.content)
        created.push(file.path)
      } else if (file.status === 'updated') {
        await writeFile(vaultId, file.path, file.content)
        updated.push(file.path)
      }
      // 'unchanged': no-op
    } catch {
      /* falha em um arquivo não aborta o lote */
    }
  }

  onProgress('Aplicação concluída.', 100)
  return { backupDir, created, updated, removed }
}
