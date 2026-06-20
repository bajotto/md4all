import { useStore } from '../../store/useStore'

export default function VaultPicker(): JSX.Element {
  const vaults = useStore((s) => s.vaults)
  const activeVaultId = useStore((s) => s.activeVaultId)
  const setActiveVault = useStore((s) => s.setActiveVault)
  const addVaultFromPicker = useStore((s) => s.addVaultFromPicker)
  const removeVault = useStore((s) => s.removeVault)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)

  const active = vaults.find((v) => v.id === activeVaultId)

  return (
    <div className="vault-picker">
      <div className="vault-row">
        <select
          className="vault-select"
          value={activeVaultId ?? ''}
          onChange={(e) => void setActiveVault(e.target.value)}
        >
          {vaults.length === 0 ? <option value="">Nenhum vault</option> : null}
          {vaults.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" title="Adicionar vault" onClick={() => void addVaultFromPicker()}>
          +
        </button>
        <button
          className="icon-btn"
          title={`Tema: ${theme === 'light' ? 'claro' : 'escuro'}`}
          onClick={() => void toggleTheme()}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </div>
      {active ? (
        <div className="vault-meta" title={active.path}>
          <span className="vault-path">{active.path}</span>
          <button
            className="link-btn"
            onClick={async () => {
              const ok = await window.api.confirm(`Remover o vault "${active.name}" da lista? (os arquivos não serão apagados)`)
              if (ok) void removeVault(active.id)
            }}
          >
            remover
          </button>
        </div>
      ) : null}
    </div>
  )
}
