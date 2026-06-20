import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getSettings, setSettings } from './settings'
import type { FileNode, Vault } from './types'

const TEXT_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const IGNORED = new Set(['.git', 'node_modules', '.obsidian', '.DS_Store'])

export function getVault(vaultId: string): Vault {
  const vault = getSettings().vaults.find((v) => v.id === vaultId)
  if (!vault) throw new Error(`Vault não encontrado: ${vaultId}`)
  return vault
}

/**
 * Resolve um caminho relativo dentro do vault, impedindo path traversal
 * (".." que escape da raiz). Retorna o caminho absoluto seguro.
 */
export function resolveInVault(vaultId: string, relPath: string): string {
  const vault = getVault(vaultId)
  const root = path.resolve(vault.path)
  const target = path.resolve(root, relPath.replace(/^[/\\]+/, ''))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Caminho fora do vault não permitido')
  }
  return target
}

function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

export async function listTree(vaultId: string): Promise<FileNode[]> {
  const vault = getVault(vaultId)
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
        nodes.push({
          name: entry.name,
          path: toRel(root, abs),
          isDir: true,
          children: await walk(abs)
        })
      } else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
        nodes.push({ name: entry.name, path: toRel(root, abs), isDir: false })
      }
    }
    // pastas primeiro, depois arquivos; ambos em ordem alfabética
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return nodes
  }

  return walk(root)
}

export async function readFile(vaultId: string, relPath: string): Promise<string> {
  const abs = resolveInVault(vaultId, relPath)
  return fs.readFile(abs, 'utf-8')
}

export async function writeFile(vaultId: string, relPath: string, content: string): Promise<void> {
  const abs = resolveInVault(vaultId, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf-8')
}

export async function createFile(vaultId: string, relPath: string): Promise<string> {
  const abs = resolveInVault(vaultId, relPath)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  try {
    // wx falha se o arquivo já existir
    await fs.writeFile(abs, '', { flag: 'wx' })
  } catch {
    throw new Error('Já existe um arquivo com esse nome')
  }
  return relPath
}

export async function createFolder(vaultId: string, relPath: string): Promise<string> {
  const abs = resolveInVault(vaultId, relPath)
  await fs.mkdir(abs, { recursive: true })
  return relPath
}

export async function rename(vaultId: string, fromRel: string, toRel: string): Promise<string> {
  const from = resolveInVault(vaultId, fromRel)
  const to = resolveInVault(vaultId, toRel)
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to)
  return toRel
}

export async function remove(vaultId: string, relPath: string): Promise<void> {
  const abs = resolveInVault(vaultId, relPath)
  await fs.rm(abs, { recursive: true, force: true })
}

/**
 * Salva os bytes de uma imagem dentro de <vault>/assets/, evitando
 * sobrescrever arquivos existentes. Retorna o caminho relativo (assets/...).
 */
export async function saveAsset(
  vaultId: string,
  fileName: string,
  data: Uint8Array
): Promise<string> {
  const vault = getVault(vaultId)
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

export function addVault(name: string, vaultPath: string): Vault {
  const settings = getSettings()
  const vault: Vault = { id: randomUUID().slice(0, 8), name, path: vaultPath }
  const vaults = [...settings.vaults, vault]
  setSettings({ vaults, activeVaultId: vault.id })
  return vault
}

export function removeVault(vaultId: string): void {
  const settings = getSettings()
  const vaults = settings.vaults.filter((v) => v.id !== vaultId)
  const activeVaultId =
    settings.activeVaultId === vaultId ? (vaults[0]?.id ?? null) : settings.activeVaultId
  setSettings({ vaults, activeVaultId })
}
