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
  const llmConfigured = useStore((s) => s.llmConfigured)
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  // 🤖 exige LLM configurada: sem chave, abre o modal ⚙ (onboarding) em vez de analisar
  const onAnalyze = (): void => {
    if (!llmConfigured) {
      setLlmSettingsOpen(true)
      return
    }
    setAnalyzing(true)
  }

  return (
    <div className="vault-actions">
      {adding ? <AddVaultModal onClose={() => setAdding(false)} /> : null}
      {analyzing ? <DocAnalysisModal onClose={() => setAnalyzing(false)} /> : null}
      <button className="add-vault-btn" onClick={() => setAdding(true)}>
        + Adicionar vault
      </button>
      <button
        className="icon-btn"
        title={llmConfigured ? 'Analisar documentação com LLM' : 'Configure sua chave OpenRouter (⚙)'}
        disabled={vaults.length === 0}
        onClick={onAnalyze}
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
