import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { getSettings, setSettings } from './settings'
import * as sftp from './sftp'
import type { FileNode, SftpConfig, SftpInput, Vault } from './types'

const TEXT_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const IGNORED = new Set(['.git', 'node_modules', '.obsidian', '.DS_Store'])

/** Code extensions considered in the doc↔code analysis. */
export const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java',
  '.rb', '.php', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.swift', '.kt',
  '.json', '.yaml', '.yml', '.toml', '.sh', '.sql', '.vue', '.svelte'
])

/** Extra folders ignored in code scanning (in addition to IGNORED). */
const CODE_IGNORED = new Set(['dist', 'out', 'build', 'coverage', '.next', '.cache', 'vendor', 'assets'])

function shouldSkipDir(name: string): boolean {
  return IGNORED.has(name) || CODE_IGNORED.has(name) || name.startsWith('.') || name.startsWith('_backup_')
}

/** Expands `~` to the user's home and normalizes the path. */
function expandPath(p: string): string {
  let out = p.trim()
  if (out === '~') out = os.homedir()
  else if (out.startsWith('~/')) out = path.join(os.homedir(), out.slice(2))
  return path.resolve(out)
}

/** Default iCloud Drive path on macOS. */
export function suggestedIcloudPath(): string {
  return path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
}

export function getVault(vaultId: string): Vault {
  const vault = getSettings().vaults.find((v) => v.id === vaultId)
  if (!vault) throw new Error(`Vault not found: ${vaultId}`)
  // old vaults don't have `kind` -> treat as local
  return { ...vault, kind: vault.kind ?? 'local' }
}

export function isSftp(vault: Vault): boolean {
  return vault.kind === 'sftp'
}

/**
 * Resolves a relative path inside a LOCAL vault, preventing path traversal.
 */
export function resolveInVault(vaultId: string, relPath: string): string {
  const vault = getVault(vaultId)
  const root = path.resolve(vault.path)
  const target = path.resolve(root, relPath.replace(/^[/\\]+/, ''))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path outside the vault is not allowed')
  }
  return target
}

function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

// ---------------- LOCAL ----------------
async function localListTree(vault: Vault): Promise<FileNode[]> {
  const root = path.resolve(vault.path)
  async function walk(dir: string): Promise<FileNode[]> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const children = await walk(abs)
        nodes.push({
          name: entry.name,
          path: toRel(root, abs),
          isDir: true,
          children,
          hasMd: dirHasMd(children)
        })
      } else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
        nodes.push({ name: entry.name, path: toRel(root, abs), isDir: false })
      }
    }
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return nodes
  }
  return walk(root)
}

const MD_RE = /\.(md|markdown|mdown|mkd)$/i
/** A directory "has md" if some loaded descendant is a markdown file. */
function dirHasMd(children: FileNode[]): boolean {
  return children.some((c) => (c.isDir ? c.hasMd === true : MD_RE.test(c.path)))
}

/** Flat collection of relative paths whose files match `exts` (local vault). */
async function localCollectPaths(vault: Vault, exts: Set<string>): Promise<string[]> {
  const root = path.resolve(vault.path)
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue
        await walk(abs)
      } else if (exts.has(path.extname(entry.name).toLowerCase())) {
        out.push(toRel(root, abs))
      }
    }
  }
  await walk(root)
  return out
}

async function localListDir(vault: Vault, relPath: string): Promise<FileNode[]> {
  const root = path.resolve(vault.path)
  const dir = relPath ? path.resolve(root, relPath.replace(/^[/\\]+/, '')) : root
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const nodes: FileNode[] = []
  for (const entry of entries) {
    if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) nodes.push({ name: entry.name, path: toRel(root, abs), isDir: true })
    else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase()))
      nodes.push({ name: entry.name, path: toRel(root, abs), isDir: false })
  }
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

// ---------------- dispatch ----------------
export async function listTree(vaultId: string): Promise<FileNode[]> {
  const vault = getVault(vaultId)
  return isSftp(vault) ? sftp.listTree(vault) : localListTree(vault)
}

/** Lists one level (immediate children) — used to load the SFTP tree on demand. */
export async function listDir(vaultId: string, relPath: string): Promise<FileNode[]> {
  const vault = getVault(vaultId)
  return isSftp(vault) ? sftp.listDir(vault, relPath) : localListDir(vault, relPath)
}

/** Is there .md in some descendant of `relPath`? (probing to highlight folders in the SFTP tree) */
export async function hasMarkdown(vaultId: string, relPath: string): Promise<boolean> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.hasMarkdown(vault, relPath)
  // local: the tree already loads hasMd; quick fs fallback if called
  const start = resolveInVault(vaultId, relPath || '.')
  const MAX = 500
  let n = 0
  async function walk(dir: string): Promise<boolean> {
    if (n++ > MAX) return false
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }
    const subdirs: string[] = []
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORED.has(e.name)) continue
      if (e.isDirectory()) subdirs.push(path.join(dir, e.name))
      else if (/\.(md|markdown|mdown|mkd)$/i.test(e.name)) return true
    }
    for (const sd of subdirs) if (await walk(sd)) return true
    return false
  }
  return walk(start)
}

export async function readFile(vaultId: string, relPath: string): Promise<string> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.readFile(vault, relPath)
  return fs.readFile(resolveInVault(vaultId, relPath), 'utf-8')
}

/** Reads file + timestamp (to detect external changes). */
export async function readFileMeta(vaultId: string, relPath: string): Promise<{ content: string; modifiedAt: number }> {
  const vault = getVault(vaultId)
  const content = await readFile(vaultId, relPath)
  if (isSftp(vault)) {
    // SFTP: uses server timestamp (approximate)
    return { content, modifiedAt: Date.now() }
  }
  // Local: uses real file mtime
  const stat = await fs.stat(resolveInVault(vaultId, relPath))
  return { content, modifiedAt: stat.mtime.getTime() }
}

/** Relative paths of all files with extension in `exts` (local or SFTP). */
export async function collectPaths(vaultId: string, exts: Set<string>): Promise<string[]> {
  const vault = getVault(vaultId)
  return isSftp(vault) ? sftp.collectPaths(vault, exts) : localCollectPaths(vault, exts)
}

export async function readAssetBinary(vaultId: string, relPath: string): Promise<Buffer> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.readBinary(vault, relPath)
  return fs.readFile(resolveInVault(vaultId, relPath))
}

export async function writeFile(vaultId: string, relPath: string, content: string): Promise<void> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.writeFile(vault, relPath, content)
  const abs = resolveInVault(vaultId, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf-8')
}

export async function createFile(vaultId: string, relPath: string): Promise<string> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.createFile(vault, relPath)
  const abs = resolveInVault(vaultId, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  try {
    await fs.writeFile(abs, '', { flag: 'wx' })
  } catch {
    throw new Error('A file with that name already exists')
  }
  return relPath
}

export async function createFolder(vaultId: string, relPath: string): Promise<string> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.createFolder(vault, relPath)
  await fs.mkdir(resolveInVault(vaultId, relPath), { recursive: true })
  return relPath
}

export async function rename(vaultId: string, fromRel: string, toRelPath: string): Promise<string> {
  const vault = getVault(vaultId)
  if (!toRelPath.trim()) throw new Error('Name cannot be empty')
  if (toRelPath.includes('\0')) throw new Error('Name contains an invalid (null) character')
  if (isSftp(vault)) return sftp.rename(vault, fromRel, toRelPath)
  const from = resolveInVault(vaultId, fromRel)
  const to = resolveInVault(vaultId, toRelPath)
  if (from === to) throw new Error('Name is the same as the current one')
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to)
  return toRelPath
}

export async function remove(vaultId: string, relPath: string): Promise<void> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.remove(vault, relPath)
  await fs.rm(resolveInVault(vaultId, relPath), { recursive: true, force: true })
}

export async function saveAsset(vaultId: string, fileName: string, data: Uint8Array): Promise<string> {
  const vault = getVault(vaultId)
  if (isSftp(vault)) return sftp.saveAsset(vault, fileName, data)
  const root = path.resolve(vault.path)
  const assetsDir = path.join(root, 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  const ext = path.extname(fileName) || '.png'
  const base = path.basename(fileName, ext).replace(/[^\w-]+/g, '-') || 'image'
  let candidate = `${base}${ext}`
  let i = 1
  while (true) {
    try {
      await fs.access(path.join(assetsDir, candidate))
      candidate = `${base}-${i++}${ext}`
    } catch {
      break
    }
  }
  await fs.writeFile(path.join(assetsDir, candidate), data)
  return `assets/${candidate}`
}

// ---------------- vault management ----------------
export async function addVault(name: string, vaultPath: string): Promise<Vault> {
  const abs = expandPath(vaultPath)
  let stat: import('fs').Stats
  try {
    stat = await fs.stat(abs)
  } catch {
    throw new Error(
      `Folder not found: ${abs}\n\nFor SMB, mount the share first (Finder → Go → Connect to Server) and point to /Volumes/<share>. For iCloud, use ~/Library/Mobile Documents/com~apple~CloudDocs.`
    )
  }
  if (!stat.isDirectory()) throw new Error(`The path is not a folder: ${abs}`)

  const settings = getSettings()
  const finalName = name?.trim() || path.basename(abs) || 'vault'
  const vault: Vault = { id: randomUUID().slice(0, 8), name: finalName, kind: 'local', path: abs }
  setSettings({ vaults: [...settings.vaults, vault], activeVaultId: vault.id })
  return vault
}

/** Builds the SFTP config encrypting the secrets. */
function buildSftpConfig(input: SftpInput): SftpConfig {
  const cfg: SftpConfig = {
    host: input.host.trim(),
    port: Number(input.port) || 22,
    username: input.username.trim()
  }
  if (input.password) cfg.encPassword = sftp.encryptSecret(input.password)
  if (input.privateKeyPath?.trim()) cfg.privateKeyPath = expandPath(input.privateKeyPath)
  if (input.passphrase) cfg.encPassphrase = sftp.encryptSecret(input.passphrase)
  return cfg
}

export async function testSftp(input: SftpInput): Promise<void> {
  await sftp.testConnection(buildSftpConfig(input), input.rootPath?.trim() || '.')
}

/** Lists one level of the remote FS using the form credentials (vault does not exist yet). */
export async function browseSftp(input: SftpInput, remotePath?: string): Promise<sftp.BrowseResult> {
  return sftp.browse(buildSftpConfig(input), remotePath)
}

export async function addSftpVault(input: SftpInput): Promise<Vault> {
  const cfg = buildSftpConfig(input)
  // validates the connection before saving
  await sftp.testConnection(cfg, input.rootPath?.trim() || '.')
  const settings = getSettings()
  const rootPath = input.rootPath?.trim() || '.'
  // defense against duplicates (e.g., double-submit): if an identical vault already exists, reuse it
  const dup = settings.vaults.find(
    (v) =>
      v.kind === 'sftp' &&
      v.path === rootPath &&
      v.sftp?.host === cfg.host &&
      (v.sftp?.port || 22) === (cfg.port || 22) &&
      v.sftp?.username === cfg.username
  )
  if (dup) {
    setSettings({ activeVaultId: dup.id })
    return dup
  }
  const vault: Vault = {
    id: randomUUID().slice(0, 8),
    name: input.name?.trim() || `${input.username}@${input.host}`,
    kind: 'sftp',
    path: rootPath,
    sftp: cfg
  }
  setSettings({ vaults: [...settings.vaults, vault], activeVaultId: vault.id })
  return vault
}

export function removeVault(vaultId: string): void {
  const settings = getSettings()
  const target = settings.vaults.find((v) => v.id === vaultId)
  if (target && (target.kind ?? 'local') === 'sftp') sftp.disconnect(vaultId)
  const vaults = settings.vaults.filter((v) => v.id !== vaultId)
  const activeVaultId =
    settings.activeVaultId === vaultId ? (vaults[0]?.id ?? null) : settings.activeVaultId
  setSettings({ vaults, activeVaultId })
}
