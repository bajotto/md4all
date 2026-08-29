import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { tabKey } from '../../types'
import type { SearchHit } from '../../types'

interface Group {
  key: string
  vaultName: string
  path: string
  hits: SearchHit[]
}

function groupByFile(hits: SearchHit[]): Group[] {
  const map = new Map<string, Group>()
  for (const h of hits) {
    const key = tabKey(h.vaultId, h.path)
    let g = map.get(key)
    if (!g) {
      g = { key, vaultName: h.vaultName, path: h.path, hits: [] }
      map.set(key, g)
    }
    g.hits.push(h)
  }
  return [...map.values()]
}

/** Literal search results (substring), grouped by file. */
export default function LiteralSearch(): JSX.Element {
  const results = useStore((s) => s.searchResults)
  const searching = useStore((s) => s.searching)
  const searchQuery = useStore((s) => s.searchQuery)
  const revealHit = useStore((s) => s.revealHit)
  const mode = useStore((s) => s.searchMode)

  const groups = useMemo(() => groupByFile(results), [results])

  if (!searchQuery.trim()) {
    return <p className="search-status">Type to search.</p>
  }

  return (
    <div className="search-results">
      {mode === 'hibrida' ? (
        <div className="search-section-label">Literal matches</div>
      ) : null}
      {searching ? (
        <p className="search-status">Searching…</p>
      ) : groups.length === 0 ? (
        <p className="search-status">No results.</p>
      ) : (
        <>
          <p className="search-status">
            {results.length} occurrence{results.length === 1 ? '' : 's'} in {groups.length}{' '}
            file{groups.length === 1 ? '' : 's'}
          </p>
          {groups.map((g) => (
            <div key={g.key} className="search-result-file">
              <div className="search-result-filehead" title={`${g.vaultName} — ${g.path}`}>
                <span className="search-result-vault">{g.vaultName}</span>
                <span className="search-result-filepath">{g.path}</span>
              </div>
              {g.hits.map((hit, i) => (
                <div
                  key={`${hit.line}:${i}`}
                  className="search-result-row"
                  onClick={() => void revealHit(hit)}
                  title={`Line ${hit.line}`}
                >
                  <span className="search-result-line">{hit.line}</span>
                  <span className="search-result-snippet">{hit.preview}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
