import VaultPicker from './VaultPicker'
import Search from './Search'
import VaultRoot from './FileTree'
import TagPanel from './TagPanel'
import { useStore } from '../../store/useStore'

export default function Sidebar(): JSX.Element {
  const vaults = useStore((s) => s.vaults)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">md4all</div>
      <VaultPicker />
      {vaults.length === 0 ? (
        <p className="sidebar-empty">Adicione um vault (local ou SSH) para começar.</p>
      ) : (
        <>
          <Search />
          <div className="vault-roots">
            {vaults.map((v) => (
              <VaultRoot key={v.id} vault={v} />
            ))}
          </div>
          <TagPanel />
        </>
      )}
    </aside>
  )
}
