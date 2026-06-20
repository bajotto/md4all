import type { BacklinkRef } from '../../types'

interface Props {
  items: BacklinkRef[]
  onSelect: (ref: BacklinkRef) => void
}

/** Painel "Mencionada em" — notas que apontam para o arquivo ativo via [[wikilink]]. */
export default function Backlinks({ items, onSelect }: Props): JSX.Element {
  return (
    <section className="backlinks">
      <div className="outline-head">Mencionada em ({items.length})</div>
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
