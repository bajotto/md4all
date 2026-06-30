export type VaultKind = 'local' | 'sftp'

export interface Vault {
  id: string
  name: string
  kind: VaultKind
  path: string
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
  hasMd?: boolean // diretório contém .md em algum descendente (destaque na árvore)
}

export interface SearchHit {
  vaultId: string
  vaultName: string
  path: string
  line: number
  preview: string
}

/** Resultado da busca por AI (LLM lê todos os .md e resume a relevância). */
export interface AiHit {
  vaultId: string
  vaultName: string
  path: string
  summary: string
  score: number
}

/** Alvo de navegação ao clicar num resultado: revela a linha/termo no editor. */
export interface RevealTarget {
  vaultId: string
  path: string
  line: number
  query: string
}

export interface AppSettings {
  vaults: Vault[]
  activeVaultId: string | null
  theme: 'light' | 'dark'
}

export interface BacklinkRef {
  path: string
  title: string
}

export interface TagInfo {
  tag: string
  count: number
}

export interface NoteRef {
  path: string
  title: string
}

export type EditorMode = 'wysiwyg' | 'source'

export interface OpenTab {
  vaultId: string
  path: string // relativo ao vault
  name: string
  content: string
  dirty: boolean
  modifiedAt?: number // timestamp unix quando foi lido (para detectar mudança externa)
  stale?: boolean // true se arquivo mudou no disco desde que foi lido
}

/** Dados do formulário de vault SFTP enviados ao main. */
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

export function tabKey(vaultId: string, path: string): string {
  return `${vaultId}::${path}`
}

// ---------- LLM / análise de documentação ----------
export interface LlmConfigView {
  hasToken: boolean
  modelPrimary: string
  modelReviewer: string
}

export type ProposedStatus = 'created' | 'updated' | 'unchanged' | 'removed'

export interface ProposedFile {
  path: string
  content: string
  rationale: string
  status: ProposedStatus
}

export interface CodeMismatch {
  doc: string
  claim: string
  evidence: string
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
  blocking: string[]
  notes: string[]
}

export interface ApplyResult {
  backupDir: string
  created: string[]
  updated: string[]
  removed: string[]
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  cost: number
  calls: number
}

export interface AnalyzeResult {
  report: AnalysisReport
  usage: LlmUsage
  stats: { docCount: number; codeCount: number }
}

export interface ReviewOutcome {
  review: ReviewResult
  usage: LlmUsage
}

// auditoria grounded
export interface Anchor {
  path: string
  quote: string
  symbol?: string
  line?: number
}
export type FindingKind = 'doc_code_mismatch' | 'contradiction' | 'duplication' | 'undocumented' | 'stale'
export type Severity = 'high' | 'medium' | 'low'
export type VerifyState = 'verified' | 'unverified' | 'refuted'
export interface Finding {
  id: string
  kind: FindingKind
  severity: Severity
  doc: string | null
  claim: string
  anchors: Anchor[]
  suggestedFix: string
  verify: VerifyState
  refutation?: string
}
export interface AuditReport {
  findings: Finding[]
  usage: LlmUsage
  stats: { docCount: number; codeCount: number; verified: number; unverified: number; refuted: number }
}
export interface AgentsContext {
  content: string
  targetPath: string
  usage: LlmUsage
  factCount: number
}
