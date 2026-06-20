import type { OutlineItem } from '../../editor/outline'

interface Props {
  items: OutlineItem[]
  onSelect: (item: OutlineItem) => void
}

/**
 * Sumário (TOC) do documento ativo. Lista os headings e, ao clicar,
 * rola o editor até o título correspondente (em ambos os modos).
 */
export default function Outline({ items, onSelect }: Props): JSX.Element {
  return (
    <aside className="outline">
      <div className="outline-head">Tópicos</div>
      <nav className="outline-list">
        {items.map((it) => (
          <button
            key={it.index}
            type="button"
            className={`outline-item lvl-${it.level}`}
            style={{ paddingLeft: 10 + (it.level - 1) * 12 }}
            title={it.text}
            onClick={() => onSelect(it)}
          >
            {it.text}
          </button>
        ))}
      </nav>
    </aside>
  )
}
