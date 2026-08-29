// Pure anchor verification logic (no dependency on Electron/fs).
// Kept separate from grounding.ts to be testable in isolation.

/** Normalizes whitespace for tolerant comparison (collapses spaces/line breaks). */
export function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface AnchorLike {
  quote?: string
  symbol?: string
}

/**
 * Does the anchor match the content? Language-agnostic heuristic:
 * - normalized quote (>= 8 chars) present, OR
 * - symbol (>= 3 chars) present, OR
 * - short quote (>= 4 chars) present literally.
 * Very short quotes are rejected to avoid false positives.
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
