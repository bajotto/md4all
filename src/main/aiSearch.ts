import { collectDocs } from './docAnalysis'
import { chatJson, emptyUsage, getModels, type ChatMessage } from './llm'
import type { LlmUsage } from './types'

// Semantic search: sends all .md files from the vault to the LLM (primary model
// already configured) and asks for the relevant files back with a summary of why.
// Reuses collectDocs (reads .md/.txt, handles local and SFTP) and chatJson from llm.ts.

export interface AiSearchHit {
  path: string // relative to the vault
  summary: string // why it is relevant (in English)
  score: number // relevance 0..1
}

export interface AiSearchResult {
  results: AiSearchHit[]
  usage: LlmUsage
}

export type Progress = (msg: string, pct?: number) => void

// context budget (~4 chars/token). Leaves room for prompt + response.
const TOTAL_MAX = 320_000
const MAX_RESULTS = 20

const SYSTEM_AI_SEARCH = `You are a semantic search engine over a user's Markdown NOTES.
You will receive a NUMBERED list of documents (each preceded by [N]) and a natural language QUERY.
Your task: find the documents genuinely relevant to the query — by meaning, not just by keyword.

Non-negotiable rules:
- Identify documents by the NUMERIC INDEX N that appears in [N]. NEVER return an index outside the provided range.
- Return only documents that are truly relevant (can be zero). Do not force results.
- "summary" explains in 1–2 sentences, in English, WHY the document answers the query (cite the relevant passage/idea).
- "score" is the relevance from 0 to 1 (1 = highly relevant).
- Order from most relevant to least relevant. At most ${MAX_RESULTS} results.`

function buildUserMessage(query: string, numbered: string): string {
  return `QUERY: ${query}

Respond ONLY with a JSON object exactly in this format (use the "index" field, not "path"):
{
  "results": [
    { "index": 0, "summary": "why it is relevant", "score": 0.95 }
  ]
}

=== DOCUMENTS ===
${numbered || '(no documents found)'}`
}

/** Proportionally truncates document content if it exceeds the budget. */
function fitDocs(docs: { path: string; content: string }[]): { path: string; content: string }[] {
  const total = docs.reduce((n, d) => n + d.content.length, 0)
  if (total <= TOTAL_MAX || docs.length === 0) return docs
  const perFile = Math.max(1_000, Math.floor(TOTAL_MAX / docs.length))
  return docs.map((d) =>
    d.content.length > perFile
      ? { path: d.path, content: d.content.slice(0, perFile) + '\n…[truncated]' }
      : d
  )
}

// Maps by the index returned by the LLM → actual vault path.
// Using the index (not path) eliminates string normalization errors.
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

  // throws if token/models are not configured (caught and displayed in the UI)
  const { primary } = getModels()

  onProgress('Reading vault documents…', 10)
  const docs = fitDocs(await collectDocs(vaultId))
  if (docs.length === 0) return { results: [], usage: emptyUsage() }

  const numbered = docs.map((d, i) => `[${i}] ${d.path}\n${d.content}`).join('\n\n---\n\n')

  onProgress('Querying the LLM…', 50)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_AI_SEARCH },
    { role: 'user', content: buildUserMessage(q, numbered) }
  ]
  const { value, usage } = await chatJson<{ results?: unknown[] }>(primary, messages, {
    temperature: 0.1,
    maxTokens: 4_000
  })

  const results = normalize(value, docs)
  onProgress('Search complete.', 100)
  return { results, usage }
}
