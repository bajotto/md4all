import { useEffect, useRef, type MutableRefObject } from 'react'
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { findMatches, type MatchRange, type SearchController, type SearchOccurrence } from '../../editor/search'

/** Imperative navigation API for source mode (used by the outline). */
export interface SourceNav {
  goToLine: (line: number) => void
}

interface Props {
  initialContent: string
  onChange: (markdown: string) => void
  searchRef?: MutableRefObject<SearchController | null>
  navRef?: MutableRefObject<SourceNav | null>
}

// ---- highlight matches via decorations ----
const setMatches = StateEffect.define<{ matches: MatchRange[]; current: number }>()
const matchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setMatches)) {
        const { matches, current } = e.value
        const b = new RangeSetBuilder<Decoration>()
        matches.forEach((m, i) => {
          if (m.end > m.start) {
            b.add(
              m.start,
              m.end,
              Decoration.mark({ class: i === current ? 'cm-search-match cm-search-current' : 'cm-search-match' })
            )
          }
        })
        value = b.finish()
      }
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f)
})

function createCmController(view: EditorView): SearchController {
  let query = ''
  let opts = { caseSensitive: false, regex: false }
  let matches: MatchRange[] = []
  let current = -1

  const pushDecos = (): void => {
    view.dispatch({ effects: setMatches.of({ matches, current }) })
  }
  const recompute = (keepIndex: boolean): void => {
    matches = findMatches(view.state.doc.toString(), query, opts)
    if (!matches.length) current = -1
    else current = keepIndex && current >= 0 ? Math.min(current, matches.length - 1) : 0
    pushDecos()
  }
  const scrollToCurrent = (): void => {
    const m = matches[current]
    if (!m) return
    view.dispatch({
      selection: { anchor: m.start, head: m.end },
      scrollIntoView: true,
      effects: setMatches.of({ matches, current })
    })
    view.focus()
  }

  return {
    setQuery(q, o) {
      query = q
      opts = o
      recompute(false)
      if (current >= 0) scrollToCurrent()
    },
    count: () => matches.length,
    currentIndex: () => current,
    next() {
      if (!matches.length) return
      current = (current + 1) % matches.length
      scrollToCurrent()
    },
    prev() {
      if (!matches.length) return
      current = (current - 1 + matches.length) % matches.length
      scrollToCurrent()
    },
    goTo(index) {
      if (index < 0 || index >= matches.length) return
      current = index
      scrollToCurrent()
    },
    replaceCurrent(replacement) {
      const m = matches[current]
      if (!m) return
      view.dispatch({ changes: { from: m.start, to: m.end, insert: replacement } })
      recompute(true)
      if (current >= 0) scrollToCurrent()
    },
    replaceAll(replacement) {
      if (!matches.length) return 0
      const n = matches.length
      view.dispatch({
        changes: matches.map((m) => ({ from: m.start, to: m.end, insert: replacement }))
      })
      matches = []
      current = -1
      pushDecos()
      return n
    },
    occurrences() {
      const doc = view.state.doc
      return matches.map<SearchOccurrence>((m, i) => {
        const line = doc.lineAt(m.start)
        return { index: i, line: line.number, preview: line.text.trim().slice(0, 200) }
      })
    },
    clear() {
      matches = []
      current = -1
      pushDecos()
    }
  }
}

/** Source mode: edits raw markdown with CodeMirror 6 and syntax highlighting. */
export default function CodeMirrorSource({
  initialContent,
  onChange,
  searchRef,
  navRef
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        matchField,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        })
      ]
    })

    const view = new EditorView({ state, parent: host })
    view.focus()
    if (searchRef) searchRef.current = createCmController(view)
    if (navRef) {
      navRef.current = {
        goToLine: (line) => {
          const n = Math.max(1, Math.min(line, view.state.doc.lines))
          const info = view.state.doc.line(n)
          view.dispatch({ selection: { anchor: info.from }, scrollIntoView: true })
          view.focus()
        }
      }
    }

    return () => {
      if (searchRef) searchRef.current = null
      if (navRef) navRef.current = null
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="cm-host" ref={hostRef} />
}
