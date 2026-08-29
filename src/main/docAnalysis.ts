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

/** Is the path a documentation file? (safety guard: never touch code in apply) */
function isDocPath(p: string): boolean {
  const i = p.lastIndexOf('.')
  return i !== -1 && DOC_EXTS.has(p.slice(i).toLowerCase())
}

// context budget (characters ~ 4 chars/token)
const PER_FILE_MAX = 16_000
const TOTAL_MAX = 360_000

export type Progress = (msg: string, pct?: number) => void

interface FileBlob {
  path: string
  content: string
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n…[truncated: ${s.length - max} characters omitted]`
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
      /* unreadable file: ignore */
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

// ---------------- prompts (anti-hallucination, focused on instructing LLMs) ----------------

const SYSTEM_DOC = `You are a technical documentation architect specialized in producing docs that SERVE TO INSTRUCT OTHER LLMs about a codebase, with maximum precision and zero hallucination.

Non-negotiable principles:
- NEVER invent APIs, files, functions, commands, flags or behaviors. Every technical claim must be traceable to the provided CODE.
- When something cannot be confirmed in the code, explicitly mark it as "unverified" rather than asserting it.
- Write objectively, without embellishment, without ambiguity, without marketing. Short and direct sentences.
- Cite real repository paths as factual anchors (e.g., src/main/ipc.ts), and line references when known (path:line).
- Canonical structure per document: Purpose · Scope · Entry points (with paths) · Invariants/contracts · Verifiable examples · Known pitfalls.
- Prefer few cohesive documents over many fragmented ones; eliminate duplication; resolve contradictions factually based on the code.
- The generated content should reduce hallucination in future LLMs: explicit about what is guaranteed vs. what is an assumption.`

function buildAnalysisUserMessage(docs: FileBlob[], code: FileBlob[]): string {
  return `Below is the current DOCUMENTATION (.md/.txt) and the SOURCE CODE of the same repository.

Tasks:
1. Understand the context of all the documentation.
2. Evaluate the documentation against itself: cohesion, contradictions and repetitions.
3. Cross-reference the documentation with the actual code and point out divergences (doc claims something the code does not confirm).
4. Propose a new documentation STRUCTURE optimized to instruct LLMs without hallucination, following the system principles.

Respond ONLY with a JSON object with exactly this format:
{
  "coherence": [string],        // observations about overall cohesion
  "contradictions": [string],   // contradictions between documents
  "duplications": [string],     // repeated/redundant content
  "codeMismatches": [ { "doc": string, "claim": string, "evidence": "path:line or description" } ],
  "proposedTree": [ { "path": "folder/file.md", "content": "full markdown", "rationale": "why", "status": "created|updated|unchanged|removed" } ]
}

Rules for proposedTree (CRITICAL):
- proposedTree contains ONLY documentation files (.md). NEVER include source code files (.ts, .js, .py, etc.) — the code is only reference for you to verify the docs.
- CORRECT the content: every document with a contradiction, doc↔code divergence or duplication must come with status "updated" and the "content" already rewritten factually and correctly (based on the real code). Only use "unchanged" for documents that are genuinely correct and non-redundant.
- List ALL of the final document set (include "unchanged" ones with their current content).
- Use "removed" (empty content) for current documents that should no longer exist (e.g., duplicates absorbed by another).
- "content" must be final markdown, ready to save, without placeholders.

=== CURRENT DOCUMENTATION ===
${docs.length ? renderBlobs(docs) : '(no documents found)'}

=== SOURCE CODE ===
${code.length ? renderBlobs(code) : '(no code files found)'}`
}

/** Summarizes a code file into a factual paragraph (used when context overflows). */
async function summarizeCode(model: string, blob: FileBlob, acc: LlmUsage): Promise<FileBlob> {
  try {
    const { content, usage } = await chat(
      model,
      [
        { role: 'system', content: 'Summarize the file in up to 6 factual lines: public exports, responsibilities and contracts. Do not invent.' },
        { role: 'user', content: `File ${blob.path}:\n\n${blob.content}` }
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

  onProgress('Large context: summarizing code files…', 30)
  // summarizes code in parallel (limited concurrency)
  const summarized: FileBlob[] = []
  const CONC = 4
  for (let i = 0; i < code.length; i += CONC) {
    const batch = code.slice(i, i + CONC)
    summarized.push(...(await Promise.all(batch.map((b) => summarizeCode(model, b, acc)))))
  }
  return { docs, code: summarized }
}

// ---------------- analysis ----------------
export async function analyze(vaultId: string, onProgress: Progress = () => {}): Promise<AnalyzeResult> {
  const { primary } = getModels()
  const usage = emptyUsage()
  onProgress('Reading vault documentation…', 5)
  const docs = await collectDocs(vaultId)
  onProgress('Reading vault source code…', 15)
  const code = await collectCode(vaultId)

  const fitted = await fitContext(primary, docs, code, onProgress, usage)

  onProgress('Analyzing cohesion, contradictions and doc↔code…', 50)
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_DOC },
    { role: 'user', content: buildAnalysisUserMessage(fitted.docs, fitted.code) }
  ]
  const { value: report, usage: u } = await chatJson<AnalysisReport>(primary, messages, {
    temperature: 0.2,
    maxTokens: 16_000
  })
  addUsage(usage, u)

  // normalize: ensures correct arrays and types (the model may return unexpected formats)
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
  onProgress('Analysis complete.', 70)
  return { report: clean, usage, stats: { docCount: docs.length, codeCount: code.length } }
}

// ---------------- fallback review (2nd LLM) ----------------
export async function reviewProposal(
  vaultId: string,
  report: AnalysisReport,
  onProgress: Progress = () => {}
): Promise<ReviewOutcome> {
  const { reviewer } = getModels()
  const usage = emptyUsage()
  onProgress('Fallback review (2nd LLM)…', 80)
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
        'You are an adversarial reviewer. Your job is to CATCH hallucinations and inaccuracies. Check whether the proposed documentation claims something the code does not confirm or that is technically incorrect. Be skeptical.'
    },
    {
      role: 'user',
      content: `Compare the PROPOSED DOCUMENTATION with the CODE. Respond ONLY with JSON:
{ "approved": boolean, "blocking": [string], "notes": [string] }
- "blocking": problems that PREVENT applying (false/hallucinated claims, contradiction with the code).
- "notes": minor observations.
- "approved" = true only if "blocking" is empty.

=== PROPOSED DOCUMENTATION ===
${proposal || '(empty)'}

=== SOURCE CODE ===
${fitted.code.length ? renderBlobs(fitted.code) : '(none)'}`
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
  onProgress('Review complete.', 95)
  return { review, usage }
}

// ================= GROUNDED AUDIT (findings with anchors) =================

const SYSTEM_AUDIT = `You are a technical documentation auditor. Your job is to find REAL problems in the documentation by cross-referencing it with the source code, with ZERO hallucination.

Non-negotiable rules:
- Every finding MUST come with at least one anchor: { path, quote } where "quote" is a LITERAL excerpt copied exactly from the provided code (not from the doc). Without a verifiable literal anchor, DO NOT report the finding.
- Do not invent files, symbols or lines. If there is no evidence in the code, do not assert.
- Focus on problems that harm anyone (human or LLM) using the docs: doc↔code divergence, contradiction between docs, duplication, stale docs, and undocumented public API.
- Be specific and objective. "claim" describes the problem; "suggestedFix" states the factual correction.`

function buildAuditUserMessage(docs: FileBlob[], code: FileBlob[]): string {
  return `Audit the DOCUMENTATION against the CODE. Respond ONLY with JSON:
{
  "findings": [
    {
      "kind": "doc_code_mismatch | contradiction | duplication | undocumented | stale",
      "severity": "high | medium | low",
      "doc": "path/to/file.md or null",
      "claim": "objective description of the problem",
      "anchors": [ { "path": "src/...", "quote": "LITERAL excerpt from the code", "symbol": "optional", "line": 0 } ],
      "suggestedFix": "suggested factual correction"
    }
  ]
}
Remember: each finding needs at least one anchor whose "quote" is copied LITERALLY from the code below. Findings without a literal anchor will be discarded.

=== CURRENT DOCUMENTATION ===
${docs.length ? renderBlobs(docs) : '(no documents found)'}

=== SOURCE CODE ===
${code.length ? renderBlobs(code) : '(no code files found)'}`
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

/** Adversarial review: the reviewer tries to REFUTE each finding by citing the code. */
async function reviewFindings(
  reviewer: string,
  findings: Finding[],
  code: FileBlob[],
  usage: LlmUsage
): Promise<Finding[]> {
  // only worth refuting what was verified by anchor
  const toReview = findings.filter((f) => f.verify === 'verified')
  if (!toReview.length) return findings

  const list = toReview
    .map((f) => `- id ${f.id}: ${f.claim}\n  anchors: ${f.anchors.map((a) => `${a.path} «${a.quote.slice(0, 80)}»`).join(' | ')}`)
    .join('\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a skeptical adversarial reviewer. For each finding, try to REFUTE it by consulting the code. Refute (refuted=true) only if the code CONTRADICTS the finding or if the anchor does not support the claim. When in doubt, refuted=false.'
    },
    {
      role: 'user',
      content: `For each finding below, respond whether it holds up against the code. JSON ONLY:
{ "verdicts": [ { "id": "f1", "refuted": false, "citation": "path:line or excerpt that justifies" } ] }

=== FINDINGS ===
${list}

=== SOURCE CODE ===
${code.length ? renderBlobs(code) : '(none)'}`
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
  onProgress('Reading vault documentation…', 5)
  const docs = await collectDocs(vaultId)
  onProgress('Reading vault source code…', 15)
  const code = await collectCode(vaultId)
  const fitted = await fitContext(primary, docs, code, onProgress, usage)

  onProgress('Auditing doc↔code…', 45)
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

  onProgress('Verifying anchors in the code…', 65)
  findings = await verifyFindings(vaultId, findings)

  onProgress('Adversarial review (2nd LLM refutes)…', 80)
  findings = await reviewFindings(reviewer, findings, fitted.code, usage)

  // sort by severity then by verification state
  const stateRank = (s: Finding['verify']): number => (s === 'verified' ? 0 : s === 'unverified' ? 1 : 2)
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || stateRank(a.verify) - stateRank(b.verify))

  const stats = {
    docCount: docs.length,
    codeCount: code.length,
    verified: findings.filter((f) => f.verify === 'verified').length,
    unverified: findings.filter((f) => f.verify === 'unverified').length,
    refuted: findings.filter((f) => f.verify === 'refuted').length
  }
  onProgress('Audit complete.', 100)
  return { findings, usage, stats }
}

// ================= AGENTS.md GENERATOR (facts + curated layer) =================

const SYSTEM_AGENTS = `You write an AGENTS.md file: concise context for a code agent (LLM) to work in this repository safely and without hallucinating.

Rules:
- Use ONLY what is in the provided code and extracted facts. DO NOT invent.
- Every non-obvious claim must end with a bracketed anchor: [src: path/file]. Use real repository paths.
- Sections: Overview · Architecture (layers and responsibilities, with paths) · Conventions · Invariants/contracts · Known pitfalls.
- Objective, short, no marketing. Do not repeat the deterministic facts block (it will be concatenated separately).`

export async function generateAgentsContext(
  vaultId: string,
  targetPath = 'AGENTS.md',
  onProgress: Progress = () => {}
): Promise<AgentsContext> {
  const { primary } = getModels()
  const usage = emptyUsage()

  onProgress('Extracting deterministic facts from the repository…', 10)
  const facts = await collectRepoFacts(vaultId)
  const factsBlock = renderFactsBlock(facts)

  onProgress('Reading source code…', 30)
  const code = await collectCode(vaultId)
  const fitted = await fitContext(primary, [], code, onProgress, usage)

  onProgress('Generating curated layer (with anchors)…', 60)
  const { content: curated, usage: u } = await chat(
    primary,
    [
      { role: 'system', content: SYSTEM_AGENTS },
      {
        role: 'user',
        content: `Already extracted facts (DO NOT repeat, just use as reference):\n${factsBlock}\n\n=== SOURCE CODE ===\n${fitted.code.length ? renderBlobs(fitted.code) : '(none)'}\n\nWrite the curated layer of the AGENTS.md in markdown (without repeating the facts).`
      }
    ],
    { temperature: 0.2, maxTokens: 6_000 }
  )
  addUsage(usage, u)

  const content = `${factsBlock}\n\n<!-- CURATED LAYER (generated by LLM, with anchors [src: …]) -->\n\n${curated.trim()}\n`
  onProgress('Agent context generated.', 100)
  return { content, targetPath, usage, factCount: facts.count }
}

// ---------------- application: backup + incremental merge ----------------
function backupDirName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `_backup_${ts}`
}

/** Writes the AGENTS.md, backing up the previous one if it exists. */
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
    /* did not exist: no backup */
  }
  await writeFile(vaultId, targetPath, content)
  return { backup, path: targetPath }
}

// ================= EXPORT / IMPORT FOR EXTERNAL LLM =================

/**
 * Writes the audit prompt to a text file in the vault.
 * The user pastes the content into the external LLM and imports the response JSON.
 */
export async function buildAuditPromptExport(vaultId: string): Promise<string> {
  const docs = await collectDocs(vaultId)
  const code = await collectCode(vaultId)
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const content = [
    '<!-- AUDIT PROMPT generated by md4all -->',
    '<!-- 1. Copy ALL this text and paste it into your LLM chat (e.g., Claude.ai, ChatGPT). -->',
    '<!-- 2. The LLM will return a JSON. Save it as a .json file. -->',
    '<!-- 3. Import the .json into md4all via "Import result". -->',
    '',
    '=== SYSTEM INSTRUCTION ===',
    SYSTEM_AUDIT,
    '',
    '=== MESSAGE ===',
    buildAuditUserMessage(docs, code)
  ].join('\n')
  const path = `docs/_prompt_audit_${ts}.txt`
  await writeFile(vaultId, path, content)
  return path
}

/** Writes the analysis/rewrite prompt to a text file in the vault. */
export async function buildAnalyzePromptExport(vaultId: string): Promise<string> {
  const docs = await collectDocs(vaultId)
  const code = await collectCode(vaultId)
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const content = [
    '<!-- ANALYSIS PROMPT generated by md4all -->',
    '<!-- 1. Copy ALL this text and paste it into your LLM chat (e.g., Claude.ai, ChatGPT). -->',
    '<!-- 2. The LLM will return a JSON. Save it as a .json file. -->',
    '<!-- 3. Import the .json into md4all via "Import result". -->',
    '',
    '=== SYSTEM INSTRUCTION ===',
    SYSTEM_DOC,
    '',
    '=== MESSAGE ===',
    buildAnalysisUserMessage(docs, code)
  ].join('\n')
  const path = `docs/_prompt_analyze_${ts}.txt`
  await writeFile(vaultId, path, content)
  return path
}

/** Processes the JSON returned by an external LLM for auditing (normalize + verify, without calling the LLM). */
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

/** Processes the JSON returned by an external LLM for analysis/rewrite. */
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
  onProgress('Creating backup of current documentation…', 10)

  // 1) full snapshot of current documentation into the backup folder (copy)
  const currentDocs = await collectPaths(vaultId, DOC_EXTS)
  for (const p of currentDocs) {
    try {
      const content = await readFile(vaultId, p)
      await writeFile(vaultId, `${backupDir}/${p}`, content)
    } catch {
      /* ignore file that fails to copy */
    }
  }

  // 2) incremental merge according to status
  const created: string[] = []
  const updated: string[] = []
  const removed: string[] = []
  const total = report.proposedTree.length || 1
  let i = 0
  for (const file of report.proposedTree) {
    i++
    // safety guard: apply only touches documentation files, never code
    if (!isDocPath(file.path)) continue
    onProgress(`Applying ${file.path}…`, 10 + Math.round((i / total) * 80))
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
      /* failure in one file does not abort the batch */
    }
  }

  onProgress('Application complete.', 100)
  return { backupDir, created, updated, removed }
}
