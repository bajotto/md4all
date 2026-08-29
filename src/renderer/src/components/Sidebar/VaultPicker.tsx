import { useState } from 'react'
import { useStore } from '../../store/useStore'
import AddVaultModal from '../AddVaultModal'
import DocAnalysisModal from '../DocAnalysis/DocAnalysisModal'

/** Action bar at the top of the sidebar: add vault, analyze docs, configure LLM and theme. */
export default function VaultPicker(): JSX.Element {
  const theme = useStore((s) => s.theme)
  const vaults = useStore((s) => s.vaults)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const setLlmSettingsOpen = useStore((s) => s.setLlmSettingsOpen)
  const llmConfigured = useStore((s) => s.llmConfigured)
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  // 🤖 requires configured LLM: without a key, opens the ⚙ modal (onboarding) instead of analyzing
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
        + Add vault
      </button>
      <button
        className="icon-btn"
        title={llmConfigured ? 'Analyze documentation with LLM' : 'Configure your OpenRouter key (⚙)'}
        disabled={vaults.length === 0}
        onClick={onAnalyze}
      >
        🤖
      </button>
      <button className="icon-btn" title="Configure LLM (OpenRouter)" onClick={() => setLlmSettingsOpen(true)}>
        ⚙
      </button>
      <button
        className="icon-btn"
        title={`Theme: ${theme === 'light' ? 'light' : 'dark'}`}
        onClick={() => void toggleTheme()}
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>
    </div>
  )
}
