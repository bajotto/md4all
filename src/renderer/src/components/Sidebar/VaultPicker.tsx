import { useState } from 'react'
import { useStore } from '../../store/useStore'
import AddVaultModal from '../AddVaultModal'
import DocAnalysisModal from '../DocAnalysis/DocAnalysisModal'

/** Barra de ações do topo da sidebar: adicionar vault, analisar docs, configurar LLM e tema. */
export default function VaultPicker(): JSX.Element {
  const theme = useStore((s) => s.theme)
  const vaults = useStore((s) => s.vaults)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const setLlmSettingsOpen = useStore((s) => s.setLlmSettingsOpen)
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  return (
    <div className="vault-actions">
      {adding ? <AddVaultModal onClose={() => setAdding(false)} /> : null}
      {analyzing ? <DocAnalysisModal onClose={() => setAnalyzing(false)} /> : null}
      <button className="add-vault-btn" onClick={() => setAdding(true)}>
        + Adicionar vault
      </button>
      <button
        className="icon-btn"
        title="Analisar documentação com LLM"
        disabled={vaults.length === 0}
        onClick={() => setAnalyzing(true)}
      >
        🤖
      </button>
      <button className="icon-btn" title="Configurar LLM (OpenRouter)" onClick={() => setLlmSettingsOpen(true)}>
        ⚙
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
