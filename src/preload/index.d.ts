import type { Api } from './index'

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

declare global {
  interface Window {
    api: Api
  }
}
