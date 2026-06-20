import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { TagInfo } from '../../types'

/** Seção da sidebar com as tags do vault; clicar filtra as notas por tag. */
export default function TagPanel(): JSX.Element {
  const loadTags = useStore((s) => s.loadTags)
  const filterByTag = useStore((s) => s.filterByTag)
  const clearTagFilter = useStore((s) => s.clearTagFilter)
  const tagFilter = useStore((s) => s.tagFilter)
  const openFile = useStore((s) => s.openFile)
  const active = useStore((s) => s.active)
  const vaults = useStore((s) => s.vaults)

  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<TagInfo[]>([])

  const refresh = (): void => {
    void loadTags().then(setTags)
  }

  // recarrega ao abrir e quando muda o conjunto de vaults
  useEffect(() => {
    if (open) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vaults.length])

  const vaultId = active?.vaultId ?? vaults[0]?.id

  return (
    <div className="tag-panel">
      <button className="tag-panel-head" onClick={() => setOpen((v) => !v)}>
        <span className={`tree-caret${open ? ' open' : ''}`}>▸</span> Tags
      </button>
      {open ? (
        tags.length === 0 ? (
          <p className="sidebar-empty">Nenhuma tag encontrada.</p>
        ) : (
          <div className="tag-list">
            {tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                className={`tag-chip${tagFilter?.tag === t.tag ? ' active' : ''}`}
                onClick={() => void filterByTag(t.tag)}
              >
                #{t.tag} <span className="tag-count">{t.count}</span>
              </button>
            ))}
          </div>
        )
      ) : null}

      {tagFilter ? (
        <div className="tag-results">
          <div className="tag-results-head">
            <span>#{tagFilter.tag}</span>
            <button className="tag-clear" onClick={clearTagFilter} title="Limpar filtro">
              ✕
            </button>
          </div>
          {tagFilter.notes.length === 0 ? (
            <p className="sidebar-empty">Sem notas.</p>
          ) : (
            tagFilter.notes.map((n) => (
              <button
                key={n.path}
                type="button"
                className="tag-result-item"
                title={n.path}
                onClick={() => vaultId && void openFile(vaultId, n.path)}
              >
                {n.title}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
