// Pure reference extraction logic from markdown (no fs) — testable.

const REF_EXT = /\.[a-z0-9]{1,6}$/i // reference must look like a file

/** Extracts intentional file references from markdown. */
export function extractRefs(md: string): string[] {
  const refs = new Set<string>()
  // 1) AGENTS.md anchors: [src: path] or [src: path:symbol]
  for (const m of md.matchAll(/\[src:\s*([^\]]+?)\s*\]/gi)) refs.add(m[1].trim())
  // 2) markdown links: [text](path)
  for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) refs.add(m[1].trim())
  return [...refs].filter((r) => {
    if (/^(https?:|mailto:|#|\/\/)/i.test(r)) return false // URLs / internal anchors
    const p = r.split(':')[0].split('#')[0]
    return REF_EXT.test(p) && !p.includes(' ')
  })
}

/** Separates path from :symbol (ignoring numeric :line). */
export function normRef(ref: string): { file: string; symbol?: string } {
  const hashless = ref.split('#')[0].replace(/^\.\//, '')
  const parts = hashless.split(':')
  const file = parts[0]
  const sym = parts[1]
  if (sym && !/^L?\d+$/.test(sym)) return { file, symbol: sym }
  return { file }
}
