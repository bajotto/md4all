import { readFile } from './vault'
import { anchorMatches } from './groundingCore'
import type { Anchor, Finding } from './types'

// content cache per (vaultId+path) during a verification
type FileCache = Map<string, string | null>

async function load(vaultId: string, path: string, cache: FileCache): Promise<string | null> {
  const key = path
  if (cache.has(key)) return cache.get(key) ?? null
  let content: string | null = null
  try {
    content = await readFile(vaultId, path)
  } catch {
    content = null
  }
  cache.set(key, content)
  return content
}

/**
 * Verifies an anchor via textual search (heuristic, language-agnostic):
 * the file exists AND (normalized quote appears in the file) OR (symbol appears).
 * `line`, if given, is only a weak signal (does not invalidate on its own).
 */
export async function verifyAnchor(
  vaultId: string,
  anchor: Anchor,
  cache: FileCache
): Promise<boolean> {
  if (!anchor?.path) return false
  const content = await load(vaultId, anchor.path, cache)
  if (content == null) return false
  return anchorMatches(content, anchor)
}

/**
 * Marks each finding as 'verified' if ≥1 anchor matches; otherwise 'unverified'.
 * Does not downgrade findings already 'refuted' (from the review).
 */
export async function verifyFindings(vaultId: string, findings: Finding[]): Promise<Finding[]> {
  const cache: FileCache = new Map()
  const out: Finding[] = []
  for (const f of findings) {
    if (f.verify === 'refuted') {
      out.push(f)
      continue
    }
    let ok = false
    for (const a of f.anchors ?? []) {
      if (await verifyAnchor(vaultId, a, cache)) {
        ok = true
        break
      }
    }
    out.push({ ...f, verify: ok ? 'verified' : 'unverified' })
  }
  return out
}
