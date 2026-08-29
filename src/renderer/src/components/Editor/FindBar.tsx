import { useEffect, useRef, useState } from 'react'
import type { SearchController, SearchOccurrence } from '../../editor/search'

interface Props {
  getController: () => SearchController | null
  revision: string // changes when switching file/mode -> reapplies the search
  startWithReplace: boolean
  onClose: () => void
}

export default function FindBar({ getController, revision, startWithReplace, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [showReplace, setShowReplace] = useState(startWithReplace)
  const [count, setCount] = useState(0)
  const [current, setCurrent] = useState(-1)
  const [listOpen, setListOpen] = useState(false)
  const [occurrences, setOccurrences] = useState<SearchOccurrence[]>([])
  const findRef = useRef<HTMLInputElement>(null)

  const sync = (): void => {
    const c = getController()
    setCount(c?.count() ?? 0)
    setCurrent(c?.currentIndex() ?? -1)
  }

  const apply = (): void => {
    const c = getController()
    if (!c) return
    c.setQuery(query, { caseSensitive, regex })
    sync()
  }

  // focuses on open
  useEffect(() => {
    findRef.current?.focus()
    findRef.current?.select()
  }, [])

  // reapplies when query/options/file change
  useEffect(() => {
    const t = setTimeout(apply, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex, revision])

  // clears highlight on unmount
  useEffect(() => {
    return () => getController()?.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const next = (): void => {
    getController()?.next()
    sync()
  }
  const prev = (): void => {
    getController()?.prev()
    sync()
  }
  const doReplace = (): void => {
    getController()?.replaceCurrent(replace)
    sync()
  }
  const doReplaceAll = (): void => {
    const n = getController()?.replaceAll(replace) ?? 0
    sync()
    if (n > 0) void window.api.confirm(`${n} occurrence(s) replaced.`)
  }
  const openList = (): void => {
    setOccurrences(getController()?.occurrences() ?? [])
    setListOpen(true)
  }

  const onFindKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prev()
      else next()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="find-bar">
      <div className="find-row">
        <button className="find-toggle" title={showReplace ? 'Hide replace' : 'Show replace'} onClick={() => setShowReplace((v) => !v)}>
          {showReplace ? '▾' : '▸'}
        </button>
        <input
          ref={findRef}
          className="find-input"
          placeholder="Find"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFindKey}
        />
        <span className="find-count">{count ? `${current + 1}/${count}` : '0/0'}</span>
        <button className="find-btn" title="Previous (Shift+Enter)" onClick={prev} disabled={!count}>◀</button>
        <button className="find-btn" title="Next (Enter)" onClick={next} disabled={!count}>▶</button>
        <button className="find-btn" title="Match case" onClick={() => setCaseSensitive((v) => !v)} aria-pressed={caseSensitive} data-on={caseSensitive}>Aa</button>
        <button className="find-btn" title="Regular expression" onClick={() => setRegex((v) => !v)} aria-pressed={regex} data-on={regex}>.*</button>
        <button className="find-btn" title="List all occurrences" onClick={openList} disabled={!count}>List</button>
        <button className="find-btn find-close" title="Close (Esc)" onClick={onClose}>✕</button>
      </div>
      {showReplace ? (
        <div className="find-row">
          <span className="find-toggle" />
          <input
            className="find-input"
            placeholder="Replace with"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                doReplace()
              } else if (e.key === 'Escape') onClose()
            }}
          />
          <button className="find-btn" onClick={doReplace} disabled={!count}>Replace</button>
          <button className="find-btn" onClick={doReplaceAll} disabled={!count}>All</button>
        </div>
      ) : null}

      {listOpen ? (
        <div className="modal-overlay" onClick={() => setListOpen(false)}>
          <div className="modal-box find-list" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">{occurrences.length} occurrence(s) of “{query}”</p>
            <div className="find-list-items">
              {occurrences.map((o) => (
                <div
                  key={o.index}
                  className="find-list-item"
                  onClick={() => {
                    getController()?.goTo(o.index)
                    sync()
                  }}
                >
                  <span className="find-list-idx">{o.line ? `L${o.line}` : `#${o.index + 1}`}</span>
                  <span className="find-list-preview">{o.preview}</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="modal-btn-ok" onClick={() => setListOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
