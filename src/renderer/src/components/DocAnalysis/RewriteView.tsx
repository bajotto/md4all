import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { diffLines, diffStat } from '../../util/diff'
import { buildProposedTree, statusBadge, type ProposedTreeNode } from './proposedTree'
import { asText, fmtCost, fmtTokens, Spinner, useDocProgress } from './shared'
import type { AnalysisReport, AnalyzeResult, ApplyResult, LlmUsage, ProposedFile, ReviewOutcome, ReviewResult } from '../../types'

type Phase = 'idle' | 'analyzing' | 'report' | 'reviewing' | 'reviewed' | 'applying' | 'done' | 'error'
type RightTab = 'content' | 'diff'

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v]
}

export default function RewriteView({ vaultId }: { vaultId: string }): JSX.Element {
  const refreshTree = useStore((s) => s.refreshTree)
  const progress = useDocProgress()

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [applied, setApplied] = useState<ApplyResult | null>(null)
  const [stats, setStats] = useState<{ docCount: number; codeCount: number } | null>(null)
  const [analyzeUsage, setAnalyzeUsage] = useState<LlmUsage | null>(null)
  const [reviewUsage, setReviewUsage] = useState<LlmUsage | null>(null)
  const [selected, setSelected] = useState<ProposedFile | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('content')
  const [currentContent, setCurrentContent] = useState<string>('')
  // granular apply: selected paths (default: all that change)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const proposedTree = useMemo(() => (report ? buildProposedTree(report.proposedTree) : []), [report])

  useEffect(() => {
    if (!selected || selected.status === 'created') {
      setCurrentContent('')
      return
    }
    void (async () => {
      try {
        setCurrentContent((await window.api.read(vaultId, selected.path)) as string)
      } catch {
        setCurrentContent('')
      }
    })()
  }, [selected, vaultId])

  const [promptExportedTo, setPromptExportedTo] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const exportPrompt = async (): Promise<void> => {
    setPromptExportedTo(null)
    try {
      const path = (await window.api.docExportAnalyzePrompt(vaultId)) as string
      setPromptExportedTo(path)
    } catch (err) {
      await window.api.showError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPhase('analyzing')
    setError(null)
    setReport(null)
    setReview(null)
    setApplied(null)
    setSelected(null)
    try {
      const rawJson = await file.text()
      const r = (await window.api.docImportAnalyze(rawJson)) as AnalyzeResult
      setReport(r.report)
      setStats(r.stats)
      setAnalyzeUsage(r.usage)
      setPicked(new Set(r.report.proposedTree.filter((f) => f.status !== 'unchanged').map((f) => f.path)))
      setPhase('report')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const runAnalysis = async (): Promise<void> => {
    setPhase('analyzing')
    setError(null)
    setReport(null)
    setReview(null)
    setApplied(null)
    setSelected(null)
    try {
      const r = (await window.api.docAnalyze(vaultId)) as AnalyzeResult
      setReport(r.report)
      setStats(r.stats)
      setAnalyzeUsage(r.usage)
      // pre-selects all files that change
      setPicked(new Set(r.report.proposedTree.filter((f) => f.status !== 'unchanged').map((f) => f.path)))
      setPhase('report')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const runReview = async (): Promise<void> => {
    if (!report) return
    setPhase('reviewing')
    try {
      const res = (await window.api.docReview(vaultId, report)) as ReviewOutcome
      setReview(res.review)
      setReviewUsage(res.usage)
      setPhase('reviewed')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const runApply = async (): Promise<void> => {
    if (!report) return
    const subset: AnalysisReport = {
      ...report,
      proposedTree: report.proposedTree.filter((f) => f.status === 'unchanged' || picked.has(f.path))
    }
    const n = subset.proposedTree.filter((f) => f.status !== 'unchanged').length
    const ok = await window.api.confirm(
      `Apply ${n} selected change(s)? Current documentation will be copied to backup first.`
    )
    if (!ok) return
    setPhase('applying')
    try {
      const res = (await window.api.docApply(vaultId, subset)) as ApplyResult
      setApplied(res)
      await refreshTree(vaultId)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const fileByPath = (p: string): ProposedFile | undefined => report?.proposedTree.find((f) => f.path === p)
  const toggle = (p: string): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  const busy = phase === 'analyzing' || phase === 'reviewing' || phase === 'applying'

  if (phase === 'idle')
    return (
      <div className="doc-center">
        <p>
          Advanced mode: the LLM rewrites the entire documentation tree to align it with the code. Review the
          diff and select what to apply — nothing is written without your confirmation.
        </p>
        <button className="modal-btn-ok" onClick={() => void runAnalysis()}>
          Propose rewrite
        </button>
        <div className="doc-external-sep">— or use external LLM —</div>
        <div className="doc-external-btns">
          <button className="inline-btn" onClick={() => void exportPrompt()}>
            Export prompt
          </button>
          <label className="inline-btn doc-import-label">
            Import result
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => void handleImport(e)} />
          </label>
        </div>
        {promptExportedTo ? (
          <div className="doc-review ok" style={{ marginTop: 8, fontSize: 12 }}>
            ✓ Prompt at <code>{promptExportedTo}</code> — paste into the LLM and import the JSON.
          </div>
        ) : null}
      </div>
    )
  if (busy && !report) return <Spinner msg={progress?.msg} pct={progress?.pct} />
  if (phase === 'error')
    return (
      <div className="doc-center">
        <p className="test-msg err">✗ {error}</p>
        <button className="modal-btn-cancel" onClick={() => setPhase('idle')}>
          Back
        </button>
      </div>
    )
  if (!report) return <div className="doc-center" />

  return (
    <div className="doc-rewrite">
      <div className="doc-split">
        <aside className="doc-left">
          <ReportSummary report={report} />
          <div className="doc-tree-title">Proposed structure (check what to apply)</div>
          <div className="doc-tree">
            {proposedTree.map((n) => (
              <ProposedNode
                key={n.path}
                node={n}
                depth={0}
                selectedPath={selected?.path ?? null}
                picked={picked}
                onToggle={toggle}
                onSelect={(p) => {
                  const f = fileByPath(p)
                  if (f) {
                    setSelected(f)
                    setRightTab(f.status === 'created' ? 'content' : 'diff')
                  }
                }}
              />
            ))}
          </div>
        </aside>
        <section className="doc-right">
          {selected ? (
            <>
              <div className="doc-right-head">
                <span className="doc-right-path">{selected.path}</span>
                <div className="doc-tabs">
                  <button className={rightTab === 'content' ? 'active' : ''} onClick={() => setRightTab('content')}>
                    Content
                  </button>
                  <button className={rightTab === 'diff' ? 'active' : ''} onClick={() => setRightTab('diff')}>
                    Diff
                  </button>
                </div>
              </div>
              {selected.rationale ? <p className="doc-rationale">💡 {selected.rationale}</p> : null}
              {rightTab === 'content' ? (
                <pre className="doc-content">{selected.content || '(empty)'}</pre>
              ) : (
                <DiffView oldText={currentContent} newText={selected.content} />
              )}
            </>
          ) : (
            <div className="doc-center">
              <p>Select a file in the proposed structure.</p>
            </div>
          )}
        </section>
      </div>

      <footer className="doc-modal-footer">
        <UsageSummary report={report} stats={stats} analyzeUsage={analyzeUsage} reviewUsage={reviewUsage} />
        {review ? (
          <div className={`doc-review ${review.approved ? 'ok' : 'block'}`}>
            {review.approved ? <span>✓ Review approved the proposal.</span> : <span>✗ Review blocked ({review.blocking.length}):</span>}
            {review.blocking.slice(0, 3).map((b, i) => (
              <div key={i} className="doc-review-item">
                • {b}
              </div>
            ))}
          </div>
        ) : null}
        {applied ? (
          <div className="doc-review ok">
            ✓ Applied. Backup at <code>{applied.backupDir}</code> · {applied.created.length} new,{' '}
            {applied.updated.length} edited, {applied.removed.length} removed.
          </div>
        ) : null}
        <div className="doc-footer-actions">
          {!applied ? (
            <>
              <button className="modal-btn-ok" onClick={() => void runReview()} disabled={busy}>
                {phase === 'reviewing' ? 'Reviewing…' : review ? 'Review again' : 'Review (2nd LLM)'}
              </button>
              <button
                className="modal-btn-ok"
                onClick={() => void runApply()}
                disabled={busy || !review || !review.approved || picked.size === 0}
                title={!review ? 'Run the review first' : ''}
              >
                {phase === 'applying' ? 'Applying…' : `Apply (${picked.size})`}
              </button>
            </>
          ) : null}
        </div>
      </footer>
    </div>
  )
}

function ReportSummary({ report }: { report: AnalysisReport }): JSX.Element {
  const section = (title: string, items: unknown): JSX.Element | null => {
    const list = asArray(items)
    return list.length ? (
      <details className="doc-report-sec" open={list.length <= 4}>
        <summary>
          {title} <span className="doc-count">{list.length}</span>
        </summary>
        <ul>
          {list.map((it, i) => (
            <li key={i}>{asText(it)}</li>
          ))}
        </ul>
      </details>
    ) : null
  }
  const mismatches = asArray(report.codeMismatches)
  return (
    <div className="doc-report">
      {section('Coherence', report.coherence)}
      {section('Contradictions', report.contradictions)}
      {section('Duplications', report.duplications)}
      {mismatches.length ? (
        <details className="doc-report-sec" open>
          <summary>
            Doc↔code divergences <span className="doc-count">{mismatches.length}</span>
          </summary>
          <ul>
            {mismatches.map((raw, i) => {
              const m = (raw ?? {}) as { doc?: unknown; claim?: unknown; evidence?: unknown }
              return (
                <li key={i}>
                  <strong>{asText(m.doc)}</strong>: {asText(m.claim)} <em>({asText(m.evidence)})</em>
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function ProposedNode({
  node,
  depth,
  selectedPath,
  picked,
  onToggle,
  onSelect
}: {
  node: ProposedTreeNode
  depth: number
  selectedPath: string | null
  picked: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const badge = statusBadge(node.status)
  if (node.isDir) {
    return (
      <div>
        <div className="doc-tree-row" style={{ paddingLeft: depth * 12 + 6 }} onClick={() => setOpen((o) => !o)}>
          <span className="tree-caret">{open ? '▾' : '▸'}</span>
          <span className="tree-label">{node.name}</span>
        </div>
        {open
          ? node.children.map((c) => (
              <ProposedNode
                key={c.path}
                node={c}
                depth={depth + 1}
                selectedPath={selectedPath}
                picked={picked}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          : null}
      </div>
    )
  }
  const isActive = selectedPath === node.path
  const changes = node.status !== 'unchanged'
  return (
    <div
      className={`doc-tree-row file ${isActive ? 'active' : ''} ${node.status === 'removed' ? 'removed' : ''}`}
      style={{ paddingLeft: depth * 12 + 20 }}
    >
      {changes ? (
        <input
          type="checkbox"
          checked={picked.has(node.path)}
          onChange={() => onToggle(node.path)}
          onClick={(e) => e.stopPropagation()}
          title="Apply this file"
        />
      ) : (
        <span style={{ width: 13, display: 'inline-block' }} />
      )}
      <span className="tree-label" onClick={() => onSelect(node.path)}>
        {node.name}
      </span>
      {badge ? <span className={`doc-badge ${badge.cls}`}>{badge.label}</span> : null}
    </div>
  )
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }): JSX.Element {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText])
  const stat = useMemo(() => diffStat(lines), [lines])
  return (
    <div className="doc-diff">
      <div className="doc-diff-stat">
        <span className="add">+{stat.added}</span> <span className="del">−{stat.removed}</span>
      </div>
      <pre className="doc-diff-body">
        {lines.map((l, i) => (
          <div key={i} className={`diff-line ${l.op}`}>
            <span className="diff-gutter">{l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}</span>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  )
}

function UsageSummary({
  report,
  stats,
  analyzeUsage,
  reviewUsage
}: {
  report: AnalysisReport
  stats: { docCount: number; codeCount: number } | null
  analyzeUsage: LlmUsage | null
  reviewUsage: LlmUsage | null
}): JSX.Element {
  const counts = { created: 0, updated: 0, removed: 0, unchanged: 0 }
  for (const f of report.proposedTree) counts[f.status]++
  const totalIn = (analyzeUsage?.promptTokens ?? 0) + (reviewUsage?.promptTokens ?? 0)
  const totalOut = (analyzeUsage?.completionTokens ?? 0) + (reviewUsage?.completionTokens ?? 0)
  const totalCost = (analyzeUsage?.cost ?? 0) + (reviewUsage?.cost ?? 0)
  const calls = (analyzeUsage?.calls ?? 0) + (reviewUsage?.calls ?? 0)
  return (
    <details className="doc-usage" open>
      <summary>
        📊 Summary — in {fmtTokens(totalIn)} · out {fmtTokens(totalOut)} tokens · ~{fmtCost(totalCost)}
      </summary>
      <div className="doc-usage-grid">
        <div>
          <span className="doc-usage-k">Read</span>
          {stats ? `${stats.docCount} docs · ${stats.codeCount} code files` : '—'}
        </div>
        <div>
          <span className="doc-usage-k">Proposal</span>
          {counts.created} new · {counts.updated} edited · {counts.removed} removed · {counts.unchanged} kept
        </div>
        <div>
          <span className="doc-usage-k">Total</span>
          {calls} call{calls === 1 ? '' : 's'} · in {fmtTokens(totalIn)} / out {fmtTokens(totalOut)} ·{' '}
          <strong>~{fmtCost(totalCost)}</strong>
        </div>
      </div>
    </details>
  )
}
