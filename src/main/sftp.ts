import SftpClient from 'ssh2-sftp-client'
import { safeStorage } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import type { FileNode, SftpConfig, Vault } from './types'

const TEXT_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const IGNORED = new Set(['.git', 'node_modules', '.obsidian', '.DS_Store'])
// heavy folders that should not be traversed in the tree (avoids slow/hung walk)
const HEAVY_DIRS = new Set([
  'dist', 'build', 'out', '.next', 'coverage', 'vendor', 'target', '.cache',
  '__pycache__', '.venv', 'venv', 'site-packages', '__pypackages__',
  '.mypy_cache', '.pytest_cache', '.tox', '.gradle', '.terraform'
])

function skipWalkDir(name: string): boolean {
  return IGNORED.has(name) || HEAVY_DIRS.has(name) || name.startsWith('.') || name.startsWith('_backup_')
}

const OP_TIMEOUT = 20_000 // no SFTP operation can hang forever

/** Ensures a promise resolves/rejects within `ms`, otherwise rejects with a clear error. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out (${ms / 1000}s) on: ${label}`)), ms)
    )
  ])
}

// ---------- secrets (safeStorage with fallback) ----------
export function encryptSecret(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(plain).toString('base64')
  }
  // fallback (environment without keychain): simple base64 — not strong encryption
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

// ---------- connection pool ----------
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
  if (!vault.sftp) throw new Error('SFTP vault without configuration')
  const client = new SftpClient(`md4all-${vault.id}`)
  const opts = await buildConnectOptions(vault.sftp)
  await withTimeout(client.connect(opts), OP_TIMEOUT, `connect ${vault.sftp.host}`)
  // when the connection drops, remove from pool to reconnect on the next operation
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

/** Executes an operation reconnecting once if the connection has dropped. */
async function withClient<T>(vault: Vault, fn: (c: SftpClient) => Promise<T>): Promise<T> {
  try {
    return await fn(await getClient(vault))
  } catch (err) {
    // tries to reconnect once
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
    if (!exists) throw new Error(`Remote folder not found: ${target}`)
  } finally {
    // only call end() if the connection was established; if connect() failed it
    // already called end() internally, and a second call can hang waiting for
    // a 'close' event that already fired.
    if (connected) {
      try {
        await Promise.race([
          client.end(),
          new Promise<void>((r) => setTimeout(r, 3000))
        ])
      } catch {
        /* ignore */
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

// ---------- remote path resolution ----------
function remoteRoot(vault: Vault): string {
  return vault.path && vault.path !== '' ? vault.path : '.'
}

function remoteResolve(vault: Vault, rel: string): string {
  const clean = rel.replace(/^[/\\]+/, '')
  if (clean.split('/').some((seg) => seg === '..')) {
    throw new Error('Path outside the vault is not allowed')
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

// ---------- file operations ----------
/**
 * Lists ONE level of the remote vault. Directories come back WITHOUT `children` (undefined =
 * "not yet loaded") so the tree is lazy: no giant recursive walk via SFTP
 * (which would hang/timeout on large home directories).
 */
export async function listDir(vault: Vault, rel: string): Promise<FileNode[]> {
  const dir = rel ? remoteResolve(vault, rel) : remoteRoot(vault)
  return withClient(vault, async (client) => {
    const entries = await withTimeout(client.list(dir), OP_TIMEOUT, `list ${dir}`)
    const nodes: FileNode[] = []
    for (const e of entries) {
      const abs = path.posix.join(dir, e.name)
      if (e.type === 'd') {
        if (skipWalkDir(e.name)) continue
        nodes.push({ name: e.name, path: toRel(vault, abs), isDir: true }) // children lazy
      } else if (TEXT_EXTS.has(path.extname(e.name).toLowerCase())) {
        nodes.push({ name: e.name, path: toRel(vault, abs), isDir: false })
      }
    }
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return nodes
  })
}

/** Full SFTP tree (recursive). Used by index/search/LLM — NOT by
 * the sidebar, which loads lazily via `listDir`. */
export async function listTree(vault: Vault): Promise<FileNode[]> {
  return withClient(vault, async (client) => {
    async function walk(dir: string): Promise<FileNode[]> {
      const entries = await withTimeout(client.list(dir), OP_TIMEOUT, `list ${dir}`)
      const nodes: FileNode[] = []
      for (const e of entries) {
        const abs = path.posix.join(dir, e.name)
        if (e.type === 'd') {
          if (skipWalkDir(e.name)) continue
          nodes.push({ name: e.name, path: toRel(vault, abs), isDir: true, children: await walk(abs) })
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

/** Flat collection of relative paths whose files match `exts` (remote vault). */
export async function collectPaths(vault: Vault, exts: Set<string>): Promise<string[]> {
  return withClient(vault, async (client) => {
    const out: string[] = []
    async function walk(dir: string): Promise<void> {
      const entries = await withTimeout(client.list(dir), OP_TIMEOUT, `list ${dir}`)
      for (const e of entries) {
        const abs = path.posix.join(dir, e.name)
        if (e.type === 'd') {
          if (skipWalkDir(e.name)) continue
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

// ---------- transient browsing (choose root before creating the vault) ----------
interface Transient {
  client: SftpClient
  timer: ReturnType<typeof setTimeout> | null
}
const transientPool = new Map<string, Transient>()
const transientConnecting = new Map<string, Promise<SftpClient>>()

function transientKey(cfg: SftpConfig): string {
  return `${cfg.host}:${cfg.port || 22}:${cfg.username}`
}

function resetIdle(key: string): void {
  const t = transientPool.get(key)
  if (!t) return
  if (t.timer) clearTimeout(t.timer)
  t.timer = setTimeout(() => void closeTransient(key), 60_000)
}

async function closeTransient(key: string): Promise<void> {
  const t = transientPool.get(key)
  if (!t) return
  if (t.timer) clearTimeout(t.timer)
  transientPool.delete(key)
  try {
    await t.client.end()
  } catch {
    /* ignore */
  }
}

async function getTransient(cfg: SftpConfig): Promise<SftpClient> {
  const key = transientKey(cfg)
  const existing = transientPool.get(key)
  if (existing) {
    resetIdle(key)
    return existing.client
  }
  // avoids race: concurrent calls share ONE connection being created
  let pending = transientConnecting.get(key)
  if (!pending) {
    pending = (async () => {
      const client = new SftpClient(`md4all-browse-${key}`)
      await withTimeout(client.connect(await buildConnectOptions(cfg)), OP_TIMEOUT, `connect ${cfg.host}`)
      transientPool.set(key, { client, timer: null })
      resetIdle(key)
      const drop = (): void => {
        if (transientPool.get(key)?.client === client) void closeTransient(key)
      }
      client.on('end', drop)
      client.on('close', drop)
      client.on('error', drop)
      return client
    })()
    transientConnecting.set(key, pending)
    void pending.finally(() => transientConnecting.delete(key))
  }
  return pending
}

export interface BrowseResult {
  path: string // current directory (absolute)
  parent: string | null // null at root
  dirs: { name: string; path: string }[]
  fileCount: number // number of files in the current directory (context)
}

/** Lists ONE level of the remote FS (subfolders), reusing a transient connection. */
export async function browse(cfg: SftpConfig, remotePath?: string): Promise<BrowseResult> {
  const client = await getTransient(cfg)
  // resolve to absolute path (realPath also validates existence)
  const target = await withTimeout(
    client.realPath((remotePath && remotePath.trim()) || '.'),
    OP_TIMEOUT,
    'resolve path'
  )
  const entries = await withTimeout(client.list(target), OP_TIMEOUT, `list ${target}`)
  const dirs = entries
    .filter((e) => e.type === 'd' && !IGNORED.has(e.name))
    .map((e) => ({ name: e.name, path: path.posix.join(target, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const fileCount = entries.filter((e) => e.type !== 'd').length
  const parent = target === '/' ? null : path.posix.dirname(target)
  return { path: target, parent, dirs, fileCount }
}

/** Closes all transient connections (when closing the picker/modal). */
export async function browseClose(): Promise<void> {
  await Promise.all([...transientPool.keys()].map((k) => closeTransient(k)))
}

const MD_RE = /\.(md|markdown|mdown|mkd)$/i

/**
 * Is there any .md in some descendant of `rel`? Searches in the background on a
 * transient connection (does NOT block navigation), with short-circuit on the
 * 1st .md and hard caps (number of listings + deadline) to never scan huge trees.
 */
export async function hasMarkdown(vault: Vault, rel: string): Promise<boolean> {
  if (!vault.sftp) return false
  const client = await getTransient(vault.sftp)
  const deadline = Date.now() + 12_000
  const MAX_LISTS = 120
  let lists = 0
  async function walk(dir: string): Promise<boolean> {
    if (lists >= MAX_LISTS || Date.now() > deadline) return false
    lists++
    let entries: SftpClient.FileInfo[]
    try {
      entries = await withTimeout(client.list(dir), OP_TIMEOUT, `list ${dir}`)
    } catch {
      return false
    }
    const subdirs: string[] = []
    for (const e of entries) {
      if (e.type === 'd') {
        if (!skipWalkDir(e.name)) subdirs.push(path.posix.join(dir, e.name))
      } else if (MD_RE.test(e.name)) {
        return true // short-circuit: found markdown
      }
    }
    for (const sd of subdirs) {
      if (await walk(sd)) return true
    }
    return false
  }
  return walk(rel ? remoteResolve(vault, rel) : remoteRoot(vault))
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
    if (await client.exists(abs)) throw new Error('A file with that name already exists')
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
