import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import LiteralSearch from './LiteralSearch'
import AiSearch from './AiSearch'

/** Drawer retrátil na direita: modo Local (só literal) ou Híbrida (literal + AI). */
export default function SearchPanel(): JSX.Element | null {
  const open = useStore((s) => s.searchPanelOpen)
  const mode = useStore((s) => s.searchMode)
  const setMode = useStore((s) => s.setSearchMode)
  const close = useStore((s) => s.closeSearchPanel)
  const runSearch = useStore((s) => s.runSearch)
  const clearSearch = useStore((s) => s.clearSearch)
  const runAiSearch = useStore((s) => s.runAiSearch)
  const clearAiSearch = useStore((s) => s.clearAiSearch)
  const aiSearching = useStore((s) => s.aiSearching)
  const searchQuery = useStore((s) => s.searchQuery)
  const llmConfigured = useStore((s) => s.llmConfigured)
  const setLlmSettingsOpen = useStore((s) => s.setLlmSettingsOpen)

  const [query, setQuery] = useState(searchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // foca no input sempre que o painel abre
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // busca literal com debounce de 250ms; limpa resultados AI se query mudar
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) {
      clearSearch()
      clearAiSearch()
      return
    }
    clearAiSearch()
    timer.current = setTimeout(() => void runSearch(query), 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, runSearch, clearSearch, clearAiSearch])

  if (!open) return null

  // Híbrida exige LLM configurada: sem chave, abre o modal ⚙ (onboarding) em vez de trocar modo
  const onHibrida = (): void => {
    if (!llmConfigured) {
      setLlmSettingsOpen(true)
      return
    }
    setMode('hibrida')
  }

  return (
    <aside className="search-drawer">
      <div className="search-drawer-head">
        <div className="search-mode-toggle" role="group" aria-label="Modo de busca">
          <button
            className={mode === 'local' ? 'active' : ''}
            onClick={() => setMode('local')}
          >
            Local
          </button>
          <button
            className={mode === 'hibrida' ? 'active' : ''}
            title={llmConfigured ? 'Busca híbrida (literal + AI)' : 'Configure sua chave OpenRouter (⚙)'}
            onClick={onHibrida}
          >
            Híbrida
          </button>
        </div>
        <button className="search-drawer-close" onClick={close} title="Fechar busca">
          ✕
        </button>
      </div>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder={mode === 'local' ? 'Buscar texto em todos os vaults…' : 'O que você procura?'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && mode === 'hibrida' && !aiSearching && query.trim()) {
            void runAiSearch(query)
          }
        }}
      />
      <div className="search-drawer-body">
        <LiteralSearch />
        {mode === 'hibrida' ? <AiSearch query={query} /> : null}
      </div>
    </aside>
  )
}
