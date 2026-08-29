import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { LlmConfigView } from '../../types'

interface Props {
  /** Query shared with the literal search (comes from the SearchPanel input). */
  query: string
}

/** AI results section in Hybrid mode: explicitly submitted (costs tokens). */
export default function AiSearch({ query }: Props): JSX.Element {
  const runAiSearch = useStore((s) => s.runAiSearch)
  const results = useStore((s) => s.aiResults)
  const searching = useStore((s) => s.aiSearching)
  const usage = useStore((s) => s.aiUsage)
  const error = useStore((s) => s.aiError)
  const aiQuery = useStore((s) => s.aiQuery)
  const openFile = useStore((s) => s.openFile)
  const setLlmSettingsOpen = useStore((s) => s.setLlmSettingsOpen)
  const vaults = useStore((s) => s.vaults)

  const llmSettingsOpen = useStore((s) => s.llmSettingsOpen)

  const [progress, setProgress] = useState<string | null>(null)
  const [cfg, setCfg] = useState<LlmConfigView | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // reloads config when the LLM modal closes (user may have saved a new token/model)
  useEffect(() => {
    if (llmSettingsOpen) return
    void (async () => {
      try {
        const c = (await window.api.llmGetConfig()) as LlmConfigView
        if (mounted.current) setCfg(c)
      } catch {
        if (mounted.current) setCfg(null)
      }
    })()
  }, [llmSettingsOpen])

  useEffect(() => {
    const off = window.api.onAiSearchProgress((p) => setProgress(p.msg))
    return off
  }, [])

  // clears the progress message from the previous search as soon as a new one starts
  // (covers both clicking "Search" and pressing Enter in the SearchPanel)
  useEffect(() => {
    if (searching) setProgress(null)
  }, [searching])

  const configured = !!cfg?.hasToken && !!cfg?.modelPrimary
  const canSearch = configured && vaults.length > 0 && !!query.trim() && !searching

  const submit = (): void => {
    if (!canSearch) return
    void runAiSearch(query)
  }

  return (
    <div className="ai-search-section">
      <div className="search-section-label">
        <span>Relevant files (AI)</span>
        {configured ? (
          <button className="ai-search-btn-inline" onClick={submit} disabled={!canSearch}>
            {searching ? '…' : 'Search'}
          </button>
        ) : null}
      </div>

      {!configured ? (
        <div className="ai-cta">
          <p>Configure the LLM (OpenRouter) to use hybrid search.</p>
          <button className="ai-cta-btn" onClick={() => setLlmSettingsOpen(true)}>
            ⚙ Configure LLM
          </button>
        </div>
      ) : (
        <>
          <p className="ai-model-hint">
            Model: <code>{cfg?.modelPrimary}</code>
          </p>
          <div className="search-results">
            {searching ? (
              <p className="search-status">{progress ?? 'Querying the LLM…'}</p>
            ) : error ? (
              <p className="search-status search-error">{error}</p>
            ) : results.length === 0 && aiQuery.trim() ? (
              <p className="search-status">No relevant documents found.</p>
            ) : (
              results.map((hit, i) => (
                <div
                  key={`${hit.vaultId}:${hit.path}:${i}`}
                  className="ai-result-card"
                  onClick={() => void openFile(hit.vaultId, hit.path)}
                  title={`${hit.vaultName} — ${hit.path}`}
                >
                  <div className="ai-result-head">
                    <span className="ai-result-path">{hit.path}</span>
                    <span className="ai-result-score">{Math.round(hit.score * 100)}%</span>
                  </div>
                  <div className="ai-result-summary">{hit.summary}</div>
                </div>
              ))
            )}
          </div>
          {usage && !searching ? (
            <p className="search-usage">
              {usage.calls} call{usage.calls === 1 ? '' : 's'} ·{' '}
              {usage.promptTokens + usage.completionTokens} tokens · ${usage.cost.toFixed(4)}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
