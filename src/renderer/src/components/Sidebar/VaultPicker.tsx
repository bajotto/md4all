import { useState } from 'react'
import { useStore } from '../../store/useStore'
import AddVaultModal from '../AddVaultModal'

/** Barra de ações do topo da sidebar: adicionar vault e alternar tema. */
export default function VaultPicker(): JSX.Element {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const [adding, setAdding] = useState(false)

  return (
    <div className="vault-actions">
      {adding ? <AddVaultModal onClose={() => setAdding(false)} /> : null}
      <button className="add-vault-btn" onClick={() => setAdding(true)}>
        + Adicionar vault
      </button>
      <button
        className="icon-btn"
        title={`Tema: ${theme === 'light' ? 'claro' : 'escuro'}`}
        onClick={() => void toggleTheme()}
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </div>
  )
}
