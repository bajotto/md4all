// Tipos e utilidades compartilhadas de busca/substituição usados pelos dois
// editores (WYSIWYG via ProseMirror e Código via CodeMirror).

export interface SearchOptions {
  caseSensitive: boolean
  regex: boolean
}

export interface SearchOccurrence {
  index: number // índice da ocorrência (0-based)
  line: number // linha aproximada (1-based) ou 0 se indisponível
  preview: string // trecho de contexto para exibir no modal
}

/** Controlador uniforme que cada editor expõe via ref. */
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

/** Acha todas as ocorrências (offsets de caractere) num texto plano. */
export function findMatches(text: string, query: string, opts: SearchOptions): MatchRange[] {
  if (!query) return []
  let re: RegExp
  try {
    re = buildRegex(query, opts)
  } catch {
    return [] // regex inválida enquanto o usuário digita
  }
  const out: MatchRange[] = []
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++ // evita loop infinito em match vazio
    if (++guard > 100000) break
  }
  return out
}
