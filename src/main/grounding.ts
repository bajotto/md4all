import { readFile } from './vault'
import { anchorMatches } from './groundingCore'
import type { Anchor, Finding } from './types'

// cache de conteúdo por (vaultId+path) durante uma verificação
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
 * Verifica uma âncora por busca textual (heurística, agnóstica de linguagem):
 * o arquivo existe E (quote normalizado aparece no arquivo) OU (symbol aparece).
 * `line`, se dado, é apenas sinal fraco (não invalida sozinho).
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
 * Marca cada finding como 'verified' se ≥1 âncora bate; senão 'unverified'.
 * Não rebaixa findings já 'refuted' (vindos da revisão).
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
