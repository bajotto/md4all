export interface Vault {
  id: string
  name: string
  path: string
}

export interface FileNode {
  name: string
  path: string // relativo à raiz do vault, usando "/"
  isDir: boolean
  children?: FileNode[]
}

export interface SearchHit {
  path: string // relativo ao vault
  line: number
  preview: string
}

export interface AppSettings {
  vaults: Vault[]
  activeVaultId: string | null
  theme: 'light' | 'dark'
}
