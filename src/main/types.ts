export type VaultKind = 'local' | 'sftp'

/** SSH/SFTP connection configuration (secrets stored encrypted separately). */
export interface SftpConfig {
  host: string
  port: number
  username: string
  // authentication: password and/or private key (certificate)
  encPassword?: string // encrypted string via safeStorage (base64)
  privateKeyPath?: string // path to the private key / .pem
  encPassphrase?: string // key passphrase, encrypted
}

export interface Vault {
  id: string
  name: string
  kind: VaultKind // 'local' (default for old vaults) | 'sftp'
  path: string // root path: local on disk, or remote on the server
  sftp?: SftpConfig // present when kind === 'sftp'
}

export interface FileNode {
  name: string
  path: string // relative to the vault root, using "/"
  isDir: boolean
  children?: FileNode[]
  hasMd?: boolean // directory contains .md in some descendant (for tree highlighting)
}

export interface SearchHit {
  path: string // relative to the vault
  line: number
  preview: string
}

/** LLM configuration (OpenRouter, and optionally local swell/devin) used in documentation analysis. */
export interface LlmConfig {
  encToken?: string // encrypted OpenRouter token (safeStorage / base64)
  modelPrimary?: string // generator/analyst model (e.g., anthropic/claude-3.5-sonnet, or 'swell:devin')
  modelReviewer?: string // 2nd LLM, fallback review
  swellUrl?: string // base URL of the local swell/devin service (e.g., http://0.0.0.0:9890)
  encSwellToken?: string // encrypted swell/devin token (X-API-Key header)
}

export interface AppSettings {
  vaults: Vault[]
  activeVaultId: string | null
  theme: 'light' | 'dark'
  llm?: LlmConfig
}

// ---------- documentation analysis by LLM ----------
export type ProposedStatus = 'created' | 'updated' | 'unchanged' | 'removed'

export interface ProposedFile {
  path: string // relative to the vault, using "/"
  content: string // proposed content (empty when status = removed)
  rationale: string // factual justification for the change
  status: ProposedStatus
}

export interface CodeMismatch {
  doc: string // affected .md file
  claim: string // doc claim that diverges from the code
  evidence: string // reference to the real code (path:line)
}

export interface AnalysisReport {
  coherence: string[]
  contradictions: string[]
  duplications: string[]
  codeMismatches: CodeMismatch[]
  proposedTree: ProposedFile[]
}

export interface ReviewResult {
  approved: boolean
  blocking: string[] // problems that prevent applying
  notes: string[] // non-blocking observations
}

/** Aggregated LLM usage (sum of all calls in a step). */
export interface LlmUsage {
  promptTokens: number // input tokens (in)
  completionTokens: number // output tokens (out)
  cost: number // approximate cost in USD (sum of OpenRouter usage.cost)
  calls: number // number of LLM calls
}

/** Analysis result: report + usage + counts of what was read. */
export interface AnalyzeResult {
  report: AnalysisReport
  usage: LlmUsage
  stats: { docCount: number; codeCount: number }
}

// ---------- grounded audit (findings with verifiable anchors) ----------
/** Reference to a real code excerpt. `quote` is literal, for textual verification. */
export interface Anchor {
  path: string
  quote: string // literal excerpt copied from the code (used in verification)
  symbol?: string
  line?: number
}

export type FindingKind =
  | 'doc_code_mismatch'
  | 'contradiction'
  | 'duplication'
  | 'undocumented'
  | 'stale'

export type Severity = 'high' | 'medium' | 'low'
export type VerifyState = 'verified' | 'unverified' | 'refuted'

export interface Finding {
  id: string
  kind: FindingKind
  severity: Severity
  doc: string | null // affected .md file (or null)
  claim: string // the claim/problem
  anchors: Anchor[] // references to the code
  suggestedFix: string
  verify: VerifyState // filled in by verification (1B/1C)
  refutation?: string // reviewer's justification, when refuted
}

export interface AuditReport {
  findings: Finding[]
  usage: LlmUsage
  stats: { docCount: number; codeCount: number; verified: number; unverified: number; refuted: number }
}

/** Generated agent context (AGENTS.md): deterministic facts + curated layer. */
export interface AgentsContext {
  content: string // final AGENTS.md markdown
  targetPath: string // relative path where to save (e.g., AGENTS.md)
  usage: LlmUsage
  factCount: number // number of deterministic facts included
}

export interface ReviewOutcome {
  review: ReviewResult
  usage: LlmUsage
}

export interface ApplyResult {
  backupDir: string
  created: string[]
  updated: string[]
  removed: string[]
}

/** Data the renderer sends to create/test an SFTP vault (secrets in plaintext). */
export interface SftpInput {
  name: string
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  rootPath: string
}
