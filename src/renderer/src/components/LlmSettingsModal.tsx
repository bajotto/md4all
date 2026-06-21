import { useEffect, useState } from 'react'
import type { LlmConfigView } from '../types'

interface Props {
  onClose: () => void
}

/** Configuração da LLM (OpenRouter): token + 2 model codes, validado ao salvar. */
export default function LlmSettingsModal({ onClose }: Props): JSX.Element {
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [modelPrimary, setModelPrimary] = useState('')
  const [modelReviewer, setModelReviewer] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null)

  useEffect(() => {
    void (async () => {
      const cfg = (await window.api.llmGetConfig()) as LlmConfigView
      setHasToken(cfg.hasToken)
      setModelPrimary(cfg.modelPrimary)
      setModelReviewer(cfg.modelReviewer)
    })()
  }, [])

  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = (await window.api.llmSaveConfig({
        token: token.trim(),
        modelPrimary: modelPrimary.trim(),
        modelReviewer: modelReviewer.trim()
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
      <div className="modal-box add-vault" onClick={(e) => e.stopPropagation()}>
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
        <input
          className="modal-input"
          placeholder="Modelo primário (ex.: anthropic/claude-3.5-sonnet)"
          value={modelPrimary}
          onChange={(e) => setModelPrimary(e.target.value)}
        />
        <input
          className="modal-input"
          placeholder="Modelo revisor / fallback (ex.: openai/gpt-4o)"
          value={modelReviewer}
          onChange={(e) => setModelReviewer(e.target.value)}
        />

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
