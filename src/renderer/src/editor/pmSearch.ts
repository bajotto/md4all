import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { buildRegex, type SearchController, type SearchOccurrence, type SearchOptions } from './search'

interface DocMatch {
  from: number
  to: number
  preview: string
}

interface SearchState {
  matches: DocMatch[]
  current: number
}

const searchKey = new PluginKey<SearchState>('md4all-search')

export function searchPlugin(): Plugin {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({ matches: [], current: -1 }),
      apply(tr, value) {
        const meta = tr.getMeta(searchKey) as SearchState | undefined
        if (meta) return meta
        if (tr.docChanged && value.matches.length) {
          // remaps positions after editing
          return {
            matches: value.matches
              .map((m) => ({
                from: tr.mapping.map(m.from),
                to: tr.mapping.map(m.to),
                preview: m.preview
              }))
              .filter((m) => m.to > m.from),
            current: value.current
          }
        }
        return value
      }
    },
    props: {
      decorations(state) {
        const s = searchKey.getState(state)
        if (!s || s.matches.length === 0) return DecorationSet.empty
        const decos = s.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class: i === s.current ? 'pm-search-match current' : 'pm-search-match'
          })
        )
        return DecorationSet.create(state.doc, decos)
      }
    }
  })
}

function computeMatches(doc: PMNode, query: string, opts: SearchOptions): DocMatch[] {
  if (!query) return []
  let re: RegExp
  try {
    re = buildRegex(query, opts)
  } catch {
    return []
  }
  const out: DocMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const from = pos + m.index
      const to = from + m[0].length
      const ctx = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24)
      out.push({ from, to, preview: ctx.trim() })
      if (m[0].length === 0) re.lastIndex++
    }
  })
  return out
}

function setState(view: EditorView, s: SearchState): void {
  view.dispatch(view.state.tr.setMeta(searchKey, s))
}

function scrollToCurrent(view: EditorView, s: SearchState): void {
  const m = s.matches[s.current]
  if (!m) return
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to))
  view.dispatch(tr.scrollIntoView().setMeta(searchKey, s))
}

/** Creates a SearchController for a ProseMirror (Milkdown) EditorView. */
export function createPmController(getView: () => EditorView | null): SearchController {
  let query = ''
  let opts: SearchOptions = { caseSensitive: false, regex: false }

  const refresh = (keepIndex: boolean): void => {
    const view = getView()
    if (!view) return
    const prev = searchKey.getState(view.state)
    const matches = computeMatches(view.state.doc, query, opts)
    let current = -1
    if (matches.length) current = keepIndex && prev ? Math.min(prev.current, matches.length - 1) : 0
    setState(view, { matches, current })
  }

  const get = (): SearchState | null => {
    const view = getView()
    if (!view) return null
    return searchKey.getState(view.state) ?? null
  }

  return {
    setQuery(q, o) {
      query = q
      opts = o
      refresh(false)
      const view = getView()
      const s = get()
      if (view && s && s.current >= 0) scrollToCurrent(view, s)
    },
    count: () => get()?.matches.length ?? 0,
    currentIndex: () => get()?.current ?? -1,
    next() {
      const view = getView()
      const s = get()
      if (!view || !s || s.matches.length === 0) return
      const ns = { ...s, current: (s.current + 1) % s.matches.length }
      scrollToCurrent(view, ns)
    },
    prev() {
      const view = getView()
      const s = get()
      if (!view || !s || s.matches.length === 0) return
      const ns = { ...s, current: (s.current - 1 + s.matches.length) % s.matches.length }
      scrollToCurrent(view, ns)
    },
    goTo(index) {
      const view = getView()
      const s = get()
      if (!view || !s || index < 0 || index >= s.matches.length) return
      scrollToCurrent(view, { ...s, current: index })
    },
    replaceCurrent(replacement) {
      const view = getView()
      const s = get()
      if (!view || !s || s.current < 0) return
      const m = s.matches[s.current]
      if (!m) return
      view.dispatch(view.state.tr.insertText(replacement, m.from, m.to))
      refresh(true)
      const ns = get()
      if (ns && ns.current >= 0) scrollToCurrent(view, ns)
    },
    replaceAll(replacement) {
      const view = getView()
      const s = get()
      if (!view || !s || s.matches.length === 0) return 0
      const n = s.matches.length
      const tr = view.state.tr
      // from last to first, so earlier positions are not invalidated
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const m = s.matches[i]
        tr.insertText(replacement, m.from, m.to)
      }
      view.dispatch(tr)
      setState(view, { matches: [], current: -1 })
      return n
    },
    occurrences() {
      const s = get()
      if (!s) return []
      return s.matches.map<SearchOccurrence>((m, i) => ({ index: i, line: 0, preview: m.preview }))
    },
    clear() {
      const view = getView()
      if (view) setState(view, { matches: [], current: -1 })
    }
  }
}
