import { useEffect, useRef, useState } from 'react'
import type { LlmConfigView } from '../types'

interface ModelOption {
  id: string
  name: string
  promptPrice: number
  completionPrice: number
}

interface CuratedEntry {
  id: string
  display: string
  stars: number   // 1–5
  half?: boolean  // .5 estrela extra
}

const SWELL_MODEL_ID = 'swell:devin'

const CURATED: CuratedEntry[] = [
  { id: 'google/gemini-2.5-flash',               display: 'Gemini 2.5 Flash',      stars: 4 },
  { id: 'anthropic/claude-haiku-4-5',            display: 'Claude Haiku 4.5',       stars: 4 },
  { id: 'deepseek/deepseek-r1',                  display: 'DeepSeek R1',            stars: 4 },
  { id: 'deepseek/deepseek-chat',                display: 'DeepSeek V3 (fast)',      stars: 4 },
  { id: 'mistralai/mistral-small-24b-instruct-2501', display: 'Mistral Small 24B', stars: 3, half: true },
  { id: 'qwen/qwen3-235b-a22b',                  display: 'Qwen3 235B',             stars: 3 },
  { id: 'openai/gpt-4o-mini',                    display: 'GPT-4o Mini',            stars: 3 },
  { id: 'meta-llama/llama-4-maverick',           display: 'Llama 4 Maverick',       stars: 3 },
  { id: 'mistralai/mistral-nemo',                display: 'Mistral Nemo',           stars: 3 },
  { id: SWELL_MODEL_ID,                          display: 'Devin (swell, local)',   stars: 0 },
]

function stars(n: number, half?: boolean): string {
  const full = '★'.repeat(n)
  const h = half ? '½' : ''
  const empty = '☆'.repeat(5 - n - (half ? 1 : 0))
  return full + h + empty
}

function formatPrice(p: number): string {
  if (p === 0) return 'grátis'
  const pm = p * 1_000_000
  if (pm < 0.01) return `$${(pm * 1000).toFixed(2)}/B`
  return `$${pm.toFixed(2)}/M`
}

interface ModelSelectProps {
  placeholder: string
  value: string
  onChange: (v: string) => void
  priceMap: Map<string, ModelOption>
  loading: boolean
}

function ModelSelect({ placeholder, value, onChange, priceMap, loading }: ModelSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const selected = CURATED.find((m) => m.id === value)

  const select = (id: string): void => {
    onChange(id)
    setOpen(false)
  }

  const getPrice = (id: string): ModelOption | undefined => {
    if (priceMap.has(id)) return priceMap.get(id)
    // fallback: prefixo parcial (ex.: OR adiciona sufixo de versão)
    for (const [k, v] of priceMap) {
      if (k.startsWith(id) || id.startsWith(k)) return v
    }
    return undefined
  }

  return (
    <div className="llm-combobox">
      <button
        ref={btnRef}
        className="llm-select-btn"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        type="button"
      >
        {selected ? (
          <span className="llm-sel-label">
            <span className="llm-combo-name">{selected.display}</span>
            <span className="llm-sel-stars">{stars(selected.stars, selected.half)}</span>
          </span>
        ) : value ? (
          <span className="llm-sel-unknown">{value}</span>
        ) : (
          <span className="llm-sel-placeholder">{placeholder}</span>
        )}
        <span className="llm-sel-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {loading && <div className="llm-combo-loading">Buscando preços…</div>}

      {open && (
        <ul className="llm-combo-list">
          {CURATED.map((m) => {
            const price = getPrice(m.id)
            return (
              <li
                key={m.id}
                className={`llm-combo-item${m.id === value ? ' active' : ''}`}
                onMouseDown={() => select(m.id)}
              >
                <div className="llm-combo-row">
                  <span className="llm-combo-name">{m.display}</span>
                  <span className="llm-sel-stars-sm">{stars(m.stars, m.half)}</span>
                  {m.id === SWELL_MODEL_ID ? (
                    <span className="llm-combo-price">local</span>
                  ) : price ? (
                    <span className="llm-combo-price">
                      {formatPrice(price.promptPrice)} in · {formatPrice(price.completionPrice)} out
                    </span>
                  ) : (
                    <span className="llm-combo-price llm-price-loading">—</span>
                  )}
                </div>
                <span className="llm-combo-id">{m.id}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

interface Props {
  onClose: () => void
}

/** Configuração da LLM (OpenRouter): token + 2 model codes, validado ao salvar. */
export default function LlmSettingsModal({ onClose }: Props): JSX.Element {
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [modelPrimary, setModelPrimary] = useState('')
  const [modelReviewer, setModelReviewer] = useState('')
  const [swellUrl, setSwellUrl] = useState('')
  const [swellToken, setSwellToken] = useState('')
  const [hasSwellToken, setHasSwellToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null)
  const [priceMap, setPriceMap] = useState<Map<string, ModelOption>>(new Map())
  const [loadingPrices, setLoadingPrices] = useState(false)

  const fetchPrices = async (tok?: string): Promise<void> => {
    setLoadingPrices(true)
    try {
      const res = (await window.api.llmListModels(tok)) as { ok: boolean; models: ModelOption[] }
      if (res.ok) {
        const map = new Map<string, ModelOption>()
        for (const m of res.models) map.set(m.id, m)
        setPriceMap(map)
      }
    } finally {
      setLoadingPrices(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const cfg = (await window.api.llmGetConfig()) as LlmConfigView
      setHasToken(cfg.hasToken)
      setModelPrimary(cfg.modelPrimary)
      setModelReviewer(cfg.modelReviewer)
      setHasSwellToken(cfg.hasSwellToken)
      setSwellUrl(cfg.swellUrl)
      if (cfg.hasToken) void fetchPrices()
    })()
  }, [])

  useEffect(() => {
    if (!token.trim()) return
    const t = setTimeout(() => void fetchPrices(token.trim()), 700)
    return () => clearTimeout(t)
  }, [token])

  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = (await window.api.llmSaveConfig({
        token: token.trim(),
        modelPrimary: modelPrimary.trim(),
        modelReviewer: modelReviewer.trim(),
        swellUrl: swellUrl.trim(),
        swellToken: swellToken.trim()
      })) as { ok: boolean; errors: string[] }
      if (res.ok) {
        setMsg({ ok: true, lines: ['✓ Configuração válida e salva'] })
        setTimeout(onClose, 700)
      } else {
        setMsg({ ok: false, lines: res.errors })
      }
    } catch (err) {
      setMsg({ ok: false, lines: [err instanceof Error ? err.message : String(err)] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box add-vault llm-config" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">Configurar LLM (OpenRouter)</p>
        <p className="modal-help">
          Usada para analisar a documentação contra o código. A chave é guardada cifrada localmente.
        </p>

        <input
          className="modal-input"
          type="password"
          placeholder={hasToken ? 'Token salvo — deixe em branco para manter' : 'Token OpenRouter (sk-or-…)'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />

        <ModelSelect
          placeholder="Modelo primário"
          value={modelPrimary}
          onChange={setModelPrimary}
          priceMap={priceMap}
          loading={loadingPrices}
        />

        <ModelSelect
          placeholder="Modelo revisor / fallback"
          value={modelReviewer}
          onChange={setModelReviewer}
          priceMap={priceMap}
          loading={loadingPrices}
        />

        {(modelPrimary === SWELL_MODEL_ID || modelReviewer === SWELL_MODEL_ID) && (
          <>
            <p className="modal-help">
              swell/devin — wrapper local para o Devin CLI. Sem custo/tokens reportados; chamadas
              podem levar minutos.
            </p>
            <input
              className="modal-input"
              type="text"
              placeholder="URL do swell (ex.: http://192.168.1.22:9890)"
              value={swellUrl}
              onChange={(e) => setSwellUrl(e.target.value)}
            />
            <input
              className="modal-input"
              type="password"
              placeholder={
                hasSwellToken ? 'Token do swell salvo — deixe em branco para manter' : 'Token do swell (X-API-Key)'
              }
              value={swellToken}
              onChange={(e) => setSwellToken(e.target.value)}
            />
          </>
        )}

        {msg ? (
          <div className={`test-msg ${msg.ok ? 'ok' : 'err'}`} style={{ display: 'block', marginTop: 8 }}>
            {msg.lines.map((l, i) => (
              <div key={i}>{msg.ok ? l : '✗ ' + l}</div>
            ))}
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="modal-btn-ok"
            disabled={busy || !modelPrimary.trim() || !modelReviewer.trim()}
            onClick={() => void save()}
          >
            {busy ? 'Validando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
