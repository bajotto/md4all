/** An outline item (heading) extracted from the active document's markdown. */
export interface OutlineItem {
  level: number // 1..6
  text: string // text already stripped of inline markup (for display)
  line: number // 1-based line in the source (navigation in Code mode)
  index: number // 0-based ordinal among headings (navigation in WYSIWYG)
}

/** Removes the most common inline markup to display the heading legibly. */
function stripInline(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images -> text
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a, b) => b || a) // wikilinks
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/<[^>]+>/g, '') // inline html tags
    .trim()
}

/**
 * Extracts ATX headings (`#`..`######`) from markdown, ignoring those
 * that appear inside fenced code blocks (``` or ~~~).
 */
export function parseOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split('\n')
  const items: OutlineItem[] = []
  let fence: string | null = null // opening marker of the code block, if open
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
