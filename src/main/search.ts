import { promises as fs } from 'fs'
import path from 'path'
import { getVault } from './vault'
import type { SearchHit } from './types'

const TEXT_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])
const IGNORED = new Set(['.git', 'node_modules', '.obsidian'])
const MAX_HITS = 200

export async function search(vaultId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const vault = getVault(vaultId)
  const root = path.resolve(vault.path)
  const hits: SearchHit[] = []

  async function walk(dir: string): Promise<void> {
    if (hits.length >= MAX_HITS) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (hits.length >= MAX_HITS) return
      if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
        await scanFile(abs)
      }
    }
  }

  async function scanFile(abs: string): Promise<void> {
    let content: string
    try {
      content = await fs.readFile(abs, 'utf-8')
    } catch {
      return
    }
    const rel = path.relative(root, abs).split(path.sep).join('/')
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= MAX_HITS) return
      const line = lines[i]
      if (line.toLowerCase().includes(q)) {
        hits.push({ path: rel, line: i + 1, preview: line.trim().slice(0, 200) })
      }
    }
  }

  await walk(root)
  return hits
}
