import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'

export default function Search(): JSX.Element {
  const runSearch = useStore((s) => s.runSearch)
  const clearSearch = useStore((s) => s.clearSearch)
  const results = useStore((s) => s.searchResults)
  const searching = useStore((s) => s.searching)
  const openFile = useStore((s) => s.openFile)

  const [query, setQuery] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) {
      clearSearch()
      return
    }
    timer.current = setTimeout(() => void runSearch(query), 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, runSearch, clearSearch])

  return (
    <div className="search-panel">
      <input
        className="search-input"
        type="search"
        placeholder="Buscar em todos os vaults…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() ? (
        <div className="search-results">
          {searching ? (
            <p className="search-status">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="search-status">Nenhum resultado.</p>
          ) : (
            results.map((hit, i) => (
              <div
                key={`${hit.vaultId}:${hit.path}:${hit.line}:${i}`}
                className="search-hit"
                onClick={() => void openFile(hit.vaultId, hit.path)}
                title={`${hit.vaultName} — ${hit.path}`}
              >
                <div className="search-hit-path">
                  <span className="search-hit-vault">{hit.vaultName}</span> {hit.path}{' '}
                  <span className="search-hit-line">:{hit.line}</span>
                </div>
                <div className="search-hit-preview">{hit.preview}</div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
