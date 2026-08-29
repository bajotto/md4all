import VaultPicker from './VaultPicker'
import VaultRoot from './FileTree'
import TagPanel from './TagPanel'
import Logo from '../Logo'
import { useStore } from '../../store/useStore'

export default function Sidebar(): JSX.Element {
  const vaults = useStore((s) => s.vaults)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Logo size={20} />
        <span className="sidebar-wordmark">md4all</span>
      </div>
      <VaultPicker />
      {vaults.length === 0 ? (
        <p className="sidebar-empty">Add a vault (local or SSH) to get started.</p>
      ) : (
        <>
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
