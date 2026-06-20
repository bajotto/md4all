export interface Vault {
  id: string
  name: string
  path: string
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
}

export interface SearchHit {
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
  path: string // relativo ao vault
  name: string
  content: string // conteúdo carregado/atual em memória
  dirty: boolean
}
