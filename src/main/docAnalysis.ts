import { CODE_EXTS, collectPaths, readFile, writeFile, remove } from './vault'
import { addUsage, chat, chatJson, emptyUsage, getModels, type ChatMessage } from './llm'
import type {
  AnalysisReport,
  AnalyzeResult,
  ApplyResult,
  LlmUsage,
  ReviewOutcome,
  ReviewResult
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

// ---------------- aplicação: backup + merge incremental ----------------
function backupDirName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `_backup_${ts}`
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
