import { collectPaths, readFile } from './vault'
import type { SearchHit } from './types'

const MAX_HITS = 500 // teto total (evita inundar a UI)
const MAX_PER_FILE = 50 // teto por arquivo (idem)

// extensões de texto pesquisáveis (mesmas do docAnalysis)
const SEARCH_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt'])

export async function search(vaultId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const files = await collectPaths(vaultId, SEARCH_EXTS)

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
