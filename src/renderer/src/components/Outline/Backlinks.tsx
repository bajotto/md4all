import type { BacklinkRef } from '../../types'

interface Props {
  items: BacklinkRef[]
  onSelect: (ref: BacklinkRef) => void
}

/** "Mentioned in" panel — notes that point to the active file via [[wikilink]]. */
export default function Backlinks({ items, onSelect }: Props): JSX.Element {
  return (
    <section className="backlinks">
      <div className="outline-head">Mentioned in ({items.length})</div>
      <nav className="outline-list">
        {items.map((it) => (
          <button
            key={it.path}
            type="button"
            className="outline-item"
            title={it.path}
            onClick={() => onSelect(it)}
          >
            {it.title}
          </button>
        ))}
      </nav>
    </section>
  )
}
