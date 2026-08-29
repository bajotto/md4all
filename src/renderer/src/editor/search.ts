// Shared search/replace types and utilities used by both editors
// (WYSIWYG via ProseMirror and Code via CodeMirror).

export interface SearchOptions {
  caseSensitive: boolean
  regex: boolean
}

export interface SearchOccurrence {
  index: number // occurrence index (0-based)
  line: number // approximate line (1-based) or 0 if unavailable
  preview: string // context snippet to display in the modal
}

/** Uniform controller that each editor exposes via ref. */
export interface SearchController {
  setQuery: (query: string, opts: SearchOptions) => void
  count: () => number
  currentIndex: () => number
  next: () => void
  prev: () => void
  goTo: (index: number) => void
  replaceCurrent: (replacement: string) => void
  replaceAll: (replacement: string) => number
  occurrences: () => SearchOccurrence[]
  clear: () => void
}

export interface MatchRange {
  start: number
  end: number
}

export function buildRegex(query: string, opts: SearchOptions): RegExp {
  const flags = opts.caseSensitive ? 'g' : 'gi'
  const src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(src, flags)
}

/** Finds all occurrences (character offsets) in plain text. */
export function findMatches(text: string, query: string, opts: SearchOptions): MatchRange[] {
  if (!query) return []
  let re: RegExp
  try {
    re = buildRegex(query, opts)
  } catch {
    return [] // invalid regex while the user types
  }
  const out: MatchRange[] = []
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++ // avoids infinite loop on empty match
    if (++guard > 100000) break
  }
  return out
}
