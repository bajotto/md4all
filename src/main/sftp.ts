import SftpClient from 'ssh2-sftp-client'
import { safeStorage } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import type { FileNode, SftpConfig, Vault } from './types'

const TEXT_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const IGNORED = new Set(['.git', 'node_modules', '.obsidian', '.DS_Store'])

// ---------- segredos (safeStorage com fallback) ----------
export function encryptSecret(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(plain).toString('base64')
  }
  // fallback (ambiente sem keychain): base64 simples — não é cifra forte
  return 'b64:' + Buffer.from(plain, 'utf8').toString('base64')
}

export function decryptSecret(enc?: string): string | undefined {
  if (!enc) return undefined
  if (enc.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(enc.slice(4), 'base64'))
    } catch {
      return undefined
    }
  }
  if (enc.startsWith('b64:')) return Buffer.from(enc.slice(4), 'base64').toString('utf8')
  return enc
}

// ---------- pool de conexões ----------
const pool = new Map<string, SftpClient>()

async function buildConnectOptions(cfg: SftpConfig): Promise<SftpClient.ConnectOptions> {
  const opts: SftpClient.ConnectOptions = {
    host: cfg.host,
    port: cfg.port || 22,
    username: cfg.username,
    readyTimeout: 15000
  }
  const password = decryptSecret(cfg.encPassword)
  if (password) opts.password = password
  if (cfg.privateKeyPath) {
    opts.privateKey = await fs.readFile(cfg.privateKeyPath)
    const pass = decryptSecret(cfg.encPassphrase)
    if (pass) opts.passphrase = pass
  }
  return opts
}

async function connect(vault: Vault): Promise<SftpClient> {
  if (!vault.sftp) throw new Error('Vault SFTP sem configuração')
  const client = new SftpClient(`md4all-${vault.id}`)
  const opts = await buildConnectOptions(vault.sftp)
  await client.connect(opts)
  // ao cair a conexão, remove do pool para reconectar na próxima operação
  const drop = (): void => {
    if (pool.get(vault.id) === client) pool.delete(vault.id)
  }
  client.on('end', drop)
  client.on('close', drop)
  client.on('error', drop)
  return client
}

async function getClient(vault: Vault): Promise<SftpClient> {
  const existing = pool.get(vault.id)
  if (existing) return existing
  const client = await connect(vault)
  pool.set(vault.id, client)
  return client
}

/** Executa uma operação reconectando uma vez se a conexão tiver caído. */
async function withClient<T>(vault: Vault, fn: (c: SftpClient) => Promise<T>): Promise<T> {
  try {
    return await fn(await getClient(vault))
  } catch (err) {
    // tenta reconectar uma vez
    pool.delete(vault.id)
    const msg = err instanceof Error ? err.message : String(err)
    if (/connect|closed|ended|ECONN|timed out|not connected/i.test(msg)) {
      return fn(await getClient(vault))
    }
    throw err
  }
}

export async function testConnection(cfg: SftpConfig, rootPath: string): Promise<void> {
  const client = new SftpClient('md4all-test')
  let connected = false
  try {
    await client.connect(await buildConnectOptions(cfg))
    connected = true
    const target = rootPath || '.'
    const exists = await client.exists(target)
    if (!exists) throw new Error(`Pasta remota não encontrada: ${target}`)
  } finally {
    // só chama end() se a conexão foi estabelecida; se connect() falhou ele já
    // chamou end() internamente, e uma segunda chamada pode travar aguardando
    // um evento 'close' que já disparou.
    if (connected) {
      try {
        await Promise.race([
          client.end(),
          new Promise<void>((r) => setTimeout(r, 3000))
        ])
      } catch {
        /* ignora */
      }
    }
  }
}

export function disconnect(vaultId: string): void {
  const c = pool.get(vaultId)
  if (c) {
    pool.delete(vaultId)
    void c.end().catch(() => {})
  }
}

// ---------- resolução de caminho remoto ----------
function remoteRoot(vault: Vault): string {
  return vault.path && vault.path !== '' ? vault.path : '.'
}

function remoteResolve(vault: Vault, rel: string): string {
  const clean = rel.replace(/^[/\\]+/, '')
  if (clean.split('/').some((seg) => seg === '..')) {
    throw new Error('Caminho fora do vault não permitido')
  }
  const root = remoteRoot(vault)
  return path.posix.join(root, clean)
}

function toRel(vault: Vault, abs: string): string {
  const root = remoteRoot(vault)
  let rel = abs.startsWith(root) ? abs.slice(root.length) : abs
  rel = rel.replace(/^\/+/, '')
  return rel
}

// ---------- operações de arquivo ----------
export async function listTree(vault: Vault): Promise<FileNode[]> {
  return withClient(vault, async (client) => {
    async function walk(dir: string): Promise<FileNode[]> {
      let entries: SftpClient.FileInfo[]
      try {
        entries = await client.list(dir)
      } catch {
        return []
      }
      const nodes: FileNode[] = []
      for (const e of entries) {
        if (IGNORED.has(e.name) || e.name.startsWith('.')) continue
        const abs = path.posix.join(dir, e.name)
        if (e.type === 'd') {
          nodes.push({
            name: e.name,
            path: toRel(vault, abs),
            isDir: true,
            children: await walk(abs)
          })
        } else if (TEXT_EXTS.has(path.extname(e.name).toLowerCase())) {
          nodes.push({ name: e.name, path: toRel(vault, abs), isDir: false })
        }
      }
      nodes.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return nodes
    }
    return walk(remoteRoot(vault))
  })
}

/** Coleta plana de caminhos relativos cujos arquivos batem com `exts` (vault remoto). */
export async function collectPaths(vault: Vault, exts: Set<string>): Promise<string[]> {
  return withClient(vault, async (client) => {
    const out: string[] = []
    async function walk(dir: string): Promise<void> {
      let entries: SftpClient.FileInfo[]
      try {
        entries = await client.list(dir)
      } catch {
        return
      }
      for (const e of entries) {
        const abs = path.posix.join(dir, e.name)
        if (e.type === 'd') {
          if (IGNORED.has(e.name) || e.name.startsWith('.') || e.name.startsWith('_backup_')) continue
          await walk(abs)
        } else if (exts.has(path.extname(e.name).toLowerCase())) {
          out.push(toRel(vault, abs))
        }
      }
    }
    await walk(remoteRoot(vault))
    return out
  })
}

export async function readFile(vault: Vault, rel: string): Promise<string> {
  const abs = remoteResolve(vault, rel)
  return withClient(vault, async (client) => {
    const buf = (await client.get(abs)) as Buffer
    return buf.toString('utf-8')
  })
}

export async function readBinary(vault: Vault, rel: string): Promise<Buffer> {
  const abs = remoteResolve(vault, rel)
  return withClient(vault, async (client) => (await client.get(abs)) as Buffer)
}

export async function writeFile(vault: Vault, rel: string, content: string): Promise<void> {
  const abs = remoteResolve(vault, rel)
  await withClient(vault, async (client) => {
    const dir = path.posix.dirname(abs)
    if (!(await client.exists(dir))) await client.mkdir(dir, true)
    await client.put(Buffer.from(content, 'utf-8'), abs)
  })
}

export async function createFile(vault: Vault, rel: string): Promise<string> {
  const abs = remoteResolve(vault, rel)
  await withClient(vault, async (client) => {
    if (await client.exists(abs)) throw new Error('Já existe um arquivo com esse nome')
    const dir = path.posix.dirname(abs)
    if (!(await client.exists(dir))) await client.mkdir(dir, true)
    await client.put(Buffer.from('', 'utf-8'), abs)
  })
  return rel
}

export async function createFolder(vault: Vault, rel: string): Promise<string> {
  const abs = remoteResolve(vault, rel)
  await withClient(vault, async (client) => {
    await client.mkdir(abs, true)
  })
  return rel
}

export async function rename(vault: Vault, fromRel: string, toRel2: string): Promise<string> {
  const from = remoteResolve(vault, fromRel)
  const to = remoteResolve(vault, toRel2)
  await withClient(vault, async (client) => {
    const dir = path.posix.dirname(to)
    if (!(await client.exists(dir))) await client.mkdir(dir, true)
    await client.rename(from, to)
  })
  return toRel2
}

export async function remove(vault: Vault, rel: string): Promise<void> {
  const abs = remoteResolve(vault, rel)
  await withClient(vault, async (client) => {
    const kind = await client.exists(abs)
    if (kind === 'd') await client.rmdir(abs, true)
    else if (kind) await client.delete(abs)
  })
}

export async function saveAsset(vault: Vault, fileName: string, data: Uint8Array): Promise<string> {
  return withClient(vault, async (client) => {
    const assetsDir = path.posix.join(remoteRoot(vault), 'assets')
    if (!(await client.exists(assetsDir))) await client.mkdir(assetsDir, true)
    const ext = path.extname(fileName) || '.png'
    const base = path.basename(fileName, ext).replace(/[^\w-]+/g, '-') || 'image'
    let candidate = `${base}${ext}`
    let i = 1
    while (await client.exists(path.posix.join(assetsDir, candidate))) {
      candidate = `${base}-${i++}${ext}`
    }
    await client.put(Buffer.from(data), path.posix.join(assetsDir, candidate))
    return `assets/${candidate}`
  })
}
