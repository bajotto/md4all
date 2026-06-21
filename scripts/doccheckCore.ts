// Lógica pura de extração de referências do markdown (sem fs) — testável.

const REF_EXT = /\.[a-z0-9]{1,6}$/i // referência precisa parecer um arquivo

/** Extrai referências intencionais a arquivos do markdown. */
export function extractRefs(md: string): string[] {
  const refs = new Set<string>()
  // 1) âncoras do AGENTS.md: [src: caminho] ou [src: caminho:símbolo]
  for (const m of md.matchAll(/\[src:\s*([^\]]+?)\s*\]/gi)) refs.add(m[1].trim())
  // 2) links markdown: [texto](caminho)
  for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) refs.add(m[1].trim())
  return [...refs].filter((r) => {
    if (/^(https?:|mailto:|#|\/\/)/i.test(r)) return false // URLs/âncoras internas
    const p = r.split(':')[0].split('#')[0]
    return REF_EXT.test(p) && !p.includes(' ')
  })
}

/** Separa caminho de :símbolo (ignorando :linha numérica). */
export function normRef(ref: string): { file: string; symbol?: string } {
  const hashless = ref.split('#')[0].replace(/^\.\//, '')
  const parts = hashless.split(':')
  const file = parts[0]
  const sym = parts[1]
  if (sym && !/^L?\d+$/.test(sym)) return { file, symbol: sym }
  return { file }
}
