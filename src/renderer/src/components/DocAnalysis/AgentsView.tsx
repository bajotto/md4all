import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { Spinner, UsageLine, useDocProgress } from './shared'
import type { AgentsContext } from '../../types'

export default function AgentsView({ vaultId }: { vaultId: string }): JSX.Element {
  const refreshTree = useStore((s) => s.refreshTree)
  const openFile = useStore((s) => s.openFile)
  const progress = useDocProgress()
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'applying' | 'error'>('idle')
  const [ctx, setCtx] = useState<AgentsContext | null>(null)
  const [target, setTarget] = useState('AGENTS.md')
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<{ backup?: string; path: string } | null>(null)

  const run = async (): Promise<void> => {
    setPhase('running')
    setError(null)
    setCtx(null)
    setApplied(null)
    try {
      const c = (await window.api.docAgents(vaultId, target.trim() || 'AGENTS.md')) as AgentsContext
      setCtx(c)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const apply = async (): Promise<void> => {
    if (!ctx) return
    const ok = await window.api.confirm(`Write ${ctx.targetPath}? The previous file (if any) goes to backup.`)
    if (!ok) return
    setPhase('applying')
    try {
      const res = (await window.api.docAgentsApply(vaultId, ctx.targetPath, ctx.content)) as {
        backup?: string
        path: string
      }
      setApplied(res)
      await refreshTree(vaultId)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  if (phase === 'idle')
    return (
      <div className="doc-center">
        <p>
          Generates a context file for agents (AGENTS.md): block of facts extracted from the repository
          (scripts, entry points, public symbols — no hallucination) + curated layer with anchors.
        </p>
        <div className="field-row" style={{ maxWidth: 360 }}>
          <input className="modal-input" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <button className="modal-btn-ok" onClick={() => void run()}>
          Generate context
        </button>
      </div>
    )
  if (phase === 'running' || phase === 'applying') return <Spinner msg={progress?.msg} pct={progress?.pct} />
  if (phase === 'error')
    return (
      <div className="doc-center">
        <p className="test-msg err">✗ {error}</p>
        <button className="modal-btn-cancel" onClick={() => setPhase('idle')}>
          Back
        </button>
      </div>
    )

  const c = ctx!
  return (
    <div className="doc-agents">
      <div className="doc-audit-toolbar">
        <span>
          {c.targetPath} · {c.factCount} facts extracted
        </span>
        <span className="doc-modal-spacer" />
        <UsageLine usage={c.usage} />
        <button className="inline-btn" onClick={() => void run()}>
          Regenerate
        </button>
        <button className="modal-btn-ok" onClick={() => void apply()}>
          Write {c.targetPath}
        </button>
      </div>
      {applied ? (
        <div className="doc-review ok">
          ✓ Written to {applied.path}
          {applied.backup ? ` · backup: ${applied.backup}` : ''} ·{' '}
          <button className="doc-anchor" onClick={() => void openFile(vaultId, applied.path)}>
            open
          </button>
        </div>
      ) : null}
      <pre className="doc-content">{c.content}</pre>
    </div>
  )
}
