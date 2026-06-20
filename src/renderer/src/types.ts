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
}

export interface SearchHit {
  vaultId: string
  vaultName: string
  path: string
  line: number
  preview: string
}

export interface AppSettings {
  vaults: Vault[]
  activeVaultId: string | null
  theme: 'light' | 'dark'
}

export type EditorMode = 'wysiwyg' | 'source'

export interface OpenTab {
  vaultId: string
  path: string // relativo ao vault
  name: string
  content: string
  dirty: boolean
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
