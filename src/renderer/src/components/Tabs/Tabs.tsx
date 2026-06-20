import { useStore } from '../../store/useStore'

export default function Tabs(): JSX.Element | null {
  const tabs = useStore((s) => s.tabs)
  const activePath = useStore((s) => s.activePath)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div
          key={t.path}
          className={`tab ${t.path === activePath ? 'active' : ''}`}
          onClick={() => setActiveTab(t.path)}
          title={t.path}
        >
          <span className="tab-name">
            {t.name}
            {t.dirty ? ' •' : ''}
          </span>
          <button
            className="tab-close"
            aria-label="Fechar aba"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(t.path)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
