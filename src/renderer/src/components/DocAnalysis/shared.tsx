import { useEffect, useState } from 'react'
import type { LlmUsage, Severity, VerifyState } from '../../types'

export function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function fmtTokens(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
}
export function fmtCost(usd: number): string {
  if (!usd) return '$0'
  if (usd < 0.01) return '$' + usd.toFixed(4)
  return '$' + usd.toFixed(usd < 1 ? 3 : 2)
}

/** Resumo de consumo (tokens in/out + custo) reutilizável entre os modos. */
export function UsageLine({ usage, prefix }: { usage: LlmUsage | null; prefix?: string }): JSX.Element | null {
  if (!usage) return null
  return (
    <span className="doc-usage-line">
      {prefix ? prefix + ' ' : ''}in {fmtTokens(usage.promptTokens)} · out {fmtTokens(usage.completionTokens)} ·{' '}
      {usage.calls} chamada{usage.calls === 1 ? '' : 's'} · <strong>~{fmtCost(usage.cost)}</strong>
    </span>
  )
}

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'alta', medium: 'média', low: 'baixa' }
export const VERIFY_LABEL: Record<VerifyState, string> = {
  verified: '✓ verificado',
  unverified: '⚠ não verificado',
  refuted: '✗ refutado'
}

/** Assina o progresso emitido pelo main enquanto o componente está montado. */
export function useDocProgress(): { msg: string; pct?: number } | null {
  const [progress, setProgress] = useState<{ msg: string; pct?: number } | null>(null)
  useEffect(() => window.api.onDocProgress((p) => setProgress(p)), [])
  return progress
}

/** Verifica se a LLM está configurada (token + 2 modelos). */
export function useLlmConfigured(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    void (async () => {
      const cfg = (await window.api.llmGetConfig()) as {
        hasToken: boolean
        modelPrimary: string
        modelReviewer: string
      }
      setOk(!!cfg.hasToken && !!cfg.modelPrimary && !!cfg.modelReviewer)
    })()
  }, [])
  return ok
}

export function Spinner({ msg, pct }: { msg?: string; pct?: number }): JSX.Element {
  return (
    <div className="doc-center">
      <div className="doc-spinner" />
      <p>{msg ?? 'Processando…'}</p>
      {pct != null ? (
        <div className="doc-progress">
          <div className="doc-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  )
}
