import { listTree, readFile } from './vault'
import type { FileNode, SearchHit } from './types'

const MAX_HITS = 500 // teto total (evita inundar a UI)
const MAX_PER_FILE = 50 // teto por arquivo (idem)

function collectFiles(nodes: FileNode[], out: string[]): void {
  for (const n of nodes) {
    if (n.isDir) collectFiles(n.children ?? [], out)
    else out.push(n.path)
  }
}

export async function search(vaultId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const tree = await listTree(vaultId)
  const files: string[] = []
  collectFiles(tree, files)

  const hits: SearchHit[] = []
  for (const rel of files) {
    if (hits.length >= MAX_HITS) break
    let content: string
    try {
      content = await readFile(vaultId, rel)
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)
    let perFile = 0
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= MAX_HITS || perFile >= MAX_PER_FILE) break
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ path: rel, line: i + 1, preview: lines[i].trim().slice(0, 200) })
        perFile++
      }
    }
  }
  return hits
}
