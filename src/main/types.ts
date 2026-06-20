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
