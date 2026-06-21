import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { SEVERITY_LABEL, Spinner, UsageLine, useDocProgress, VERIFY_LABEL } from './shared'
import type { AuditReport, Finding } from '../../types'

const KIND_LABEL: Record<Finding['kind'], string> = {
  doc_code_mismatch: 'doc↔código',
  contradiction: 'contradição',
  duplication: 'duplicação',
  undocumented: 'sem doc',
  stale: 'obsoleto'
}

function buildMarkdown(report: AuditReport): string {
  const lines = ['# Auditoria de documentação', '']
  lines.push(
    `Verificados: ${report.stats.verified} · Não verificados: ${report.stats.unverified} · Refutados: ${report.stats.refuted}`,
    ''
  )
  for (const f of report.findings) {
    lines.push(`## [${SEVERITY_LABEL[f.severity]}] ${KIND_LABEL[f.kind]} — ${VERIFY_LABEL[f.verify]}`)
    if (f.doc) lines.push(`Doc: \`${f.doc}\``)
    lines.push(f.claim)
    for (const a of f.anchors) lines.push(`- âncora: \`${a.path}${a.line ? ':' + a.line : ''}\` «${a.quote.slice(0, 120)}»`)
    if (f.suggestedFix) lines.push(`Correção sugerida: ${f.suggestedFix}`)
    if (f.refutation) lines.push(`Refutação do revisor: ${f.refutation}`)
    lines.push('')
  }
  return lines.join('\n')
}

export default function AuditView({ vaultId }: { vaultId: string }): JSX.Element {
  const openFile = useStore((s) => s.openFile)
  const progress = useDocProgress()
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportedTo, setExportedTo] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    setPhase('running')
    setError(null)
    setReport(null)
    setExportedTo(null)
    try {
      const r = (await window.api.docAudit(vaultId)) as AuditReport
      setReport(r)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const exportReport = async (): Promise<void> => {
    if (!report) return
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `docs/_audit_${ts}.md`
    try {
      await window.api.write(vaultId, path, buildMarkdown(report))
      setExportedTo(path)
    } catch (err) {
      await window.api.showError(err instanceof Error ? err.message : String(err))
    }
  }

  if (phase === 'idle')
    return (
      <div className="doc-center">
        <p>
          Audita a documentação contra o código: acha divergências, contradições, duplicações e doc obsoleta —
          cada achado com âncora verificada no código e revisão adversarial.
        </p>
        <button className="modal-btn-ok" onClick={() => void run()}>
          Auditar
        </button>
      </div>
    )
  if (phase === 'running') return <Spinner msg={progress?.msg} pct={progress?.pct} />
  if (phase === 'error')
    return (
      <div className="doc-center">
        <p className="test-msg err">✗ {error}</p>
        <button className="modal-btn-cancel" onClick={() => setPhase('idle')}>
          Voltar
        </button>
      </div>
    )

  // done
  const r = report!
  return (
    <div className="doc-audit">
      <div className="doc-audit-toolbar">
        <span>
          {r.findings.length} achados · <span className="ok">{r.stats.verified} verificados</span> ·{' '}
          <span className="warn">{r.stats.unverified} não verif.</span> ·{' '}
          <span className="err">{r.stats.refuted} refutados</span>
        </span>
        <span className="doc-modal-spacer" />
        <UsageLine usage={r.usage} />
        <button className="inline-btn" onClick={() => void exportReport()}>
          Exportar .md
        </button>
        <button className="inline-btn" onClick={() => void run()}>
          Reauditar
        </button>
      </div>
      {exportedTo ? <div className="doc-review ok">✓ Exportado para {exportedTo}</div> : null}
      <div className="doc-findings">
        {r.findings.length === 0 ? (
          <p className="tree-empty">Nenhum problema encontrado. 🎉</p>
        ) : (
          r.findings.map((f) => (
            <div key={f.id} className={`doc-finding sev-${f.severity} v-${f.verify}`}>
              <div className="doc-finding-head">
                <span className={`doc-sev ${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
                <span className="doc-kind">{KIND_LABEL[f.kind]}</span>
                <span className={`doc-verify ${f.verify}`}>{VERIFY_LABEL[f.verify]}</span>
                {f.doc ? <span className="doc-finding-doc">{f.doc}</span> : null}
              </div>
              <div className="doc-finding-claim">{f.claim}</div>
              {f.suggestedFix ? <div className="doc-finding-fix">💡 {f.suggestedFix}</div> : null}
              {f.refutation ? <div className="doc-finding-refut">✗ revisor: {f.refutation}</div> : null}
              {f.anchors.map((a, i) => (
                <button
                  key={i}
                  className="doc-anchor"
                  title={a.quote}
                  onClick={() => void openFile(vaultId, a.path)}
                >
                  {a.path}
                  {a.line ? ':' + a.line : ''} «{a.quote.slice(0, 60)}
                  {a.quote.length > 60 ? '…' : ''}»
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
