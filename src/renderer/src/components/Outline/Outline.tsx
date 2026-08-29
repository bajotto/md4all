import type { OutlineItem } from '../../editor/outline'

interface Props {
  items: OutlineItem[]
  onSelect: (item: OutlineItem) => void
}

/**
 * Table of contents (TOC) for the active document. Lists headings and, on click,
 * scrolls the editor to the corresponding title (in both modes).
 */
export default function Outline({ items, onSelect }: Props): JSX.Element {
  return (
    <aside className="outline">
      <div className="outline-head">Topics</div>
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
