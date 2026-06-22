import { useStore } from '../../store/useStore'
import { tabKey } from '../../types'

export default function Tabs(): JSX.Element | null {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.active)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const closeAllTabs = useStore((s) => s.closeAllTabs)

  if (tabs.length === 0) return null

  return (
    <div className="tabs">
      {tabs.map((t) => {
        const isActive = active?.vaultId === t.vaultId && active?.path === t.path
        return (
          <div
            key={tabKey(t.vaultId, t.path)}
            className={`tab ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(t.vaultId, t.path)}
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
                closeTab(t.vaultId, t.path)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        className="tabs-close-all"
        title="Fechar todas as abas"
        aria-label="Fechar todas as abas"
        onClick={() => closeAllTabs()}
      >
        Fechar todas
      </button>
    </div>
  )
}
