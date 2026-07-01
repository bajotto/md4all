export type VaultKind = 'local' | 'sftp'

/** Configuração de conexão SSH/SFTP (segredos guardados cifrados à parte). */
export interface SftpConfig {
  host: string
  port: number
  username: string
  // autenticação: senha e/ou chave privada (certificado)
  encPassword?: string // string cifrada via safeStorage (base64)
  privateKeyPath?: string // caminho para a chave privada / .pem
  encPassphrase?: string // passphrase da chave, cifrada
}

export interface Vault {
  id: string
  name: string
  kind: VaultKind // 'local' (padrão p/ vaults antigos) | 'sftp'
  path: string // caminho raiz: local no disco, ou remoto no servidor
  sftp?: SftpConfig // presente quando kind === 'sftp'
}

export interface FileNode {
  name: string
  path: string // relativo à raiz do vault, usando "/"
  isDir: boolean
  children?: FileNode[]
  hasMd?: boolean // diretório contém .md em algum descendente (p/ destaque na árvore)
}

export interface SearchHit {
  path: string // relativo ao vault
  line: number
  preview: string
}

/** Configuração da LLM (OpenRouter, e opcionalmente swell/devin local) usada na análise de documentação. */
export interface LlmConfig {
  encToken?: string // token OpenRouter cifrado (safeStorage / base64)
  modelPrimary?: string // modelo gerador/analista (ex.: anthropic/claude-3.5-sonnet, ou 'swell:devin')
  modelReviewer?: string // 2ª LLM, revisão de fallback
  swellUrl?: string // URL base do serviço swell/devin local (ex.: http://192.168.1.22:9890)
  encSwellToken?: string // token do swell/devin cifrado (header X-API-Key)
}

export interface AppSettings {
  vaults: Vault[]
  activeVaultId: string | null
  theme: 'light' | 'dark'
  llm?: LlmConfig
}

// ---------- análise de documentação por LLM ----------
export type ProposedStatus = 'created' | 'updated' | 'unchanged' | 'removed'

export interface ProposedFile {
  path: string // relativo ao vault, usando "/"
  content: string // conteúdo proposto (vazio quando status = removed)
  rationale: string // justificativa factual da mudança
  status: ProposedStatus
}

export interface CodeMismatch {
  doc: string // arquivo .md afetado
  claim: string // afirmação da doc que diverge do código
  evidence: string // referência ao código real (path:linha)
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
  blocking: string[] // problemas que impedem aplicar
  notes: string[] // observações não bloqueantes
}

/** Consumo agregado da LLM (somatório de todas as chamadas de uma etapa). */
export interface LlmUsage {
  promptTokens: number // tokens de entrada (in)
  completionTokens: number // tokens de saída (out)
  cost: number // custo aproximado em USD (somatório de usage.cost do OpenRouter)
  calls: number // nº de chamadas à LLM
}

/** Resultado da análise: relatório + uso + contagens do que foi lido. */
export interface AnalyzeResult {
  report: AnalysisReport
  usage: LlmUsage
  stats: { docCount: number; codeCount: number }
}

// ---------- auditoria grounded (findings com âncoras verificáveis) ----------
/** Referência a um trecho real de código. `quote` é literal, p/ verificação textual. */
export interface Anchor {
  path: string
  quote: string // trecho literal copiado do código (usado na verificação)
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
  doc: string | null // arquivo .md afetado (ou null)
  claim: string // a afirmação/problema
  anchors: Anchor[] // referências ao código
  suggestedFix: string
  verify: VerifyState // preenchido pela verificação (1B/1C)
  refutation?: string // justificativa do revisor, quando refuted
}

export interface AuditReport {
  findings: Finding[]
  usage: LlmUsage
  stats: { docCount: number; codeCount: number; verified: number; unverified: number; refuted: number }
}

/** Contexto do agente gerado (AGENTS.md): fatos determinísticos + camada curada. */
export interface AgentsContext {
  content: string // markdown final do AGENTS.md
  targetPath: string // caminho relativo onde gravar (ex.: AGENTS.md)
  usage: LlmUsage
  factCount: number // nº de fatos determinísticos incluídos
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

/** Dados que o renderer envia para criar/testar um vault SFTP (segredos em claro). */
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
