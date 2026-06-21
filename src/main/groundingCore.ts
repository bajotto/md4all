// Lógica pura de verificação de âncoras (sem dependência de Electron/fs).
// Mantida separada de grounding.ts para ser testável em isolamento.

/** Normaliza whitespace para comparação tolerante (colapsa espaços/quebras). */
export function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface AnchorLike {
  quote?: string
  symbol?: string
}

/**
 * A âncora bate com o conteúdo? Heurística agnóstica de linguagem:
 * - quote normalizado (>= 8 chars) presente, OU
 * - symbol (>= 3 chars) presente, OU
 * - quote curto (>= 4 chars) presente literalmente.
 * Quotes muito curtos são rejeitados para evitar falsos positivos.
 */
export function anchorMatches(content: string, anchor: AnchorLike): boolean {
  const hay = normalize(content)
  const quote = anchor.quote ? normalize(anchor.quote) : ''
  if (quote && quote.length >= 8 && hay.includes(quote)) return true
  if (anchor.symbol) {
    const sym = normalize(anchor.symbol)
    if (sym.length >= 3 && hay.includes(sym)) return true
  }
  if (quote && quote.length >= 4 && hay.includes(quote)) return true
  return false
}
