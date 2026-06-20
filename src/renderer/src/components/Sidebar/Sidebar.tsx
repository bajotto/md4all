import VaultPicker from './VaultPicker'
import Search from './Search'
import FileTree from './FileTree'
import { useStore } from '../../store/useStore'

export default function Sidebar(): JSX.Element {
  const activeVaultId = useStore((s) => s.activeVaultId)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">md4all</div>
      <VaultPicker />
      {activeVaultId ? (
        <>
          <Search />
          <FileTree />
        </>
      ) : (
        <p className="sidebar-empty">Adicione um vault para começar.</p>
      )}
    </aside>
  )
}
