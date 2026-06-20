/** Um item do sumário (heading) extraído do markdown do documento ativo. */
export interface OutlineItem {
  level: number // 1..6
  text: string // texto já limpo de marcação inline (para exibição)
  line: number // linha 1-based no source (navegação no modo Código)
  index: number // ordinal 0-based entre os headings (navegação no WYSIWYG)
}

/** Remove a marcação inline mais comum para exibir o título de forma legível. */
function stripInline(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/imagens -> texto
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a, b) => b || a) // wikilinks
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // negrito
    .replace(/(\*|_)(.*?)\1/g, '$2') // itálico
    .replace(/~~(.*?)~~/g, '$1') // tachado
    .replace(/`([^`]*)`/g, '$1') // código inline
    .replace(/<[^>]+>/g, '') // tags html inline
    .trim()
}

/**
 * Extrai os headings ATX (`#`..`######`) do markdown, ignorando os que
 * aparecem dentro de blocos de código cercados (``` ou ~~~).
 */
export function parseOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split('\n')
  const items: OutlineItem[] = []
  let fence: string | null = null // marcador de abertura do bloco de código, se aberto
  let index = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = line.match(/^\s{0,3}(```+|~~~+)/)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (fence === null) fence = marker[0]
      else if (line.trim().startsWith(fence)) fence = null
      continue
    }
    if (fence !== null) continue

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!m) continue
    const text = stripInline(m[2])
    if (!text) continue
    items.push({ level: m[1].length, text, line: i + 1, index })
    index++
  }
  return items
}
