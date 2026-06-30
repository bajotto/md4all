import { collectDocs } from './docAnalysis'
import { chatJson, emptyUsage, getModels, type ChatMessage } from './llm'
import type { LlmUsage } from './types'

// Busca semântica: manda todos os .md do vault para a LLM (modelo primário já
// configurado) e pede de volta os arquivos relevantes com um resumo do porquê.
// Reusa collectDocs (lê .md/.txt, trata local e SFTP) e chatJson de llm.ts.

export interface AiSearchHit {
  path: string // relativo ao vault
  summary: string // por que é relevante (em pt-BR)
  score: number // relevância 0..1
}

export interface AiSearchResult {
  results: AiSearchHit[]
  usage: LlmUsage
}

export type Progress = (msg: string, pct?: number) => void

// orçamento de contexto (~4 chars/token). Deixa folga p/ prompt + resposta.
const TOTAL_MAX = 320_000
const MAX_RESULTS = 20

const SYSTEM_AI_SEARCH = `Você é um motor de busca semântica sobre as NOTAS em Markdown de um usuário.
Receberá uma lista NUMERADA de documentos (cada um precedido de [N]) e uma CONSULTA em linguagem natural.
Sua tarefa: encontrar os documentos genuinamente relevantes para a consulta — por significado, não só por palavra-chave.

Regras inegociáveis:
- Identifique os documentos pelo ÍNDICE NUMÉRICO N que aparece em [N]. NUNCA retorne um índice fora do intervalo fornecido.
- Retorne só documentos realmente relevantes (pode ser zero). Não force resultados.
- "summary" explica em 1–2 frases, em português, POR QUE o documento responde à consulta (cite o trecho/ideia relevante).
- "score" é a relevância de 0 a 1 (1 = altamente relevante).
- Ordene do mais relevante ao menos relevante. No máximo ${MAX_RESULTS} resultados.`

function buildUserMessage(query: string, numbered: string): string {
  return `CONSULTA: ${query}

Responda APENAS com um objeto JSON exatamente neste formato (use o campo "index", não "path"):
{
  "results": [
    { "index": 0, "summary": "por que é relevante", "score": 0.95 }
  ]
}

=== DOCUMENTOS ===
${numbered || '(nenhum documento encontrado)'}`
}

/** Trunca proporcionalmente o conteúdo dos documentos se estourar o orçamento. */
function fitDocs(docs: { path: string; content: string }[]): { path: string; content: string }[] {
  const total = docs.reduce((n, d) => n + d.content.length, 0)
  if (total <= TOTAL_MAX || docs.length === 0) return docs
  const perFile = Math.max(1_000, Math.floor(TOTAL_MAX / docs.length))
  return docs.map((d) =>
    d.content.length > perFile
      ? { path: d.path, content: d.content.slice(0, perFile) + '\n…[truncado]' }
      : d
  )
}

// Mapeia pelo índice retornado pelo LLM → caminho real do vault.
// Usar índice (não caminho) elimina erros de normalização de string.
function normalize(raw: unknown, docs: { path: string; content: string }[]): AiSearchHit[] {
  const arr = Array.isArray((raw as { results?: unknown })?.results)
    ? (raw as { results: unknown[] }).results
    : []
  const seen = new Set<number>()
  const hits: AiSearchHit[] = []
  for (const r of arr) {
    const o = (r ?? {}) as Record<string, unknown>
    const idx =
      typeof o.index === 'number' ? Math.round(o.index) : parseInt(String(o.index ?? '-1'), 10)
    if (isNaN(idx) || idx < 0 || idx >= docs.length) continue
    if (seen.has(idx)) continue
    seen.add(idx)
    let score = typeof o.score === 'number' ? o.score : parseFloat(String(o.score ?? '0')) || 0
    score = Math.max(0, Math.min(1, score))
    hits.push({ path: docs[idx].path, summary: String(o.summary ?? ''), score })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, MAX_RESULTS)
}

export async function aiSearch(
  vaultId: string,
  query: string,
  onProgress: Progress = () => {}
): Promise<AiSearchResult> {
  const q = query.trim()
  if (!q) return { results: [], usage: emptyUsage() }

  // lança se token/modelos não estiverem configurados (capturado e exibido na UI)
  const { primary } = getModels()

  onProgress('Lendo documentos do vault…', 10)
  const docs = fitDocs(await collectDocs(vaultId))
  if (docs.length === 0) return { results: [], usage: emptyUsage() }

  const numbered = docs.map((d, i) => `[${i}] ${d.path}\n${d.content}`).join('\n\n---\n\n')

  onProgress('Consultando a LLM…', 50)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_AI_SEARCH },
    { role: 'user', content: buildUserMessage(q, numbered) }
  ]
  const { value, usage } = await chatJson<{ results?: unknown[] }>(primary, messages, {
    temperature: 0.1,
    maxTokens: 4_000
  })

  const results = normalize(value, docs)
  onProgress('Busca concluída.', 100)
  return { results, usage }
}
