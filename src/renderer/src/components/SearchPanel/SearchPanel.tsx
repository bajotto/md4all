import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import LiteralSearch from './LiteralSearch'
import AiSearch from './AiSearch'

/** Collapsible drawer on the right: Local mode (literal only) or Hybrid (literal + AI). */
export default function SearchPanel(): JSX.Element | null {
  const open = useStore((s) => s.searchPanelOpen)
  const mode = useStore((s) => s.searchMode)
  const setMode = useStore((s) => s.setSearchMode)
  const close = useStore((s) => s.closeSearchPanel)
  const runSearch = useStore((s) => s.runSearch)
  const clearSearch = useStore((s) => s.clearSearch)
  const runAiSearch = useStore((s) => s.runAiSearch)
  const clearAiSearch = useStore((s) => s.clearAiSearch)
  const aiSearching = useStore((s) => s.aiSearching)
  const searchQuery = useStore((s) => s.searchQuery)
  const llmConfigured = useStore((s) => s.llmConfigured)
  const setLlmSettingsOpen = useStore((s) => s.setLlmSettingsOpen)

  const [query, setQuery] = useState(searchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // focuses the input whenever the panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // literal search with 250ms debounce; clears AI results if query changes
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) {
      clearSearch()
      clearAiSearch()
      return
    }
    clearAiSearch()
    timer.current = setTimeout(() => void runSearch(query), 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, runSearch, clearSearch, clearAiSearch])

  if (!open) return null

  // Hybrid requires configured LLM: without a key, opens the ⚙ modal (onboarding) instead of switching mode
  const onHibrida = (): void => {
    if (!llmConfigured) {
      setLlmSettingsOpen(true)
      return
    }
    setMode('hibrida')
  }

  return (
    <aside className="search-drawer">
      <div className="search-drawer-head">
        <div className="search-mode-toggle" role="group" aria-label="Search mode">
          <button
            className={mode === 'local' ? 'active' : ''}
            onClick={() => setMode('local')}
          >
            Local
          </button>
          <button
            className={mode === 'hibrida' ? 'active' : ''}
            title={llmConfigured ? 'Hybrid search (literal + AI)' : 'Configure your OpenRouter key (⚙)'}
            onClick={onHibrida}
          >
            Hybrid
          </button>
        </div>
        <button className="search-drawer-close" onClick={close} title="Close search">
          ✕
        </button>
      </div>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder={mode === 'local' ? 'Search text across all vaults…' : 'What are you looking for?'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && mode === 'hibrida' && !aiSearching && query.trim()) {
            void runAiSearch(query)
          }
        }}
      />
      <div className="search-drawer-body">
        <LiteralSearch />
        {mode === 'hibrida' ? <AiSearch query={query} /> : null}
      </div>
    </aside>
  )
}
