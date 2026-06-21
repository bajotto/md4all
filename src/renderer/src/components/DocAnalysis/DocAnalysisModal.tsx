import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { diffLines, diffStat } from '../../util/diff'
import { buildProposedTree, statusBadge, type ProposedTreeNode } from './proposedTree'
import type {
  AnalysisReport,
  AnalyzeResult,
  ApplyResult,
  LlmUsage,
  ProposedFile,
  ReviewOutcome,
  ReviewResult,
  Vault
} from '../../types'

interface Props {
  onClose: () => void
}

type Phase = 'config' | 'idle' | 'analyzing' | 'report' | 'reviewing' | 'reviewed' | 'applying' | 'done' | 'error'
type RightTab = 'content' | 'diff'

export default function DocAnalysisModal({ onClose }: Props): JSX.Element {
  const vaults = useStore((s) => s.vaults)
  const active = useStore((s) => s.active)
  const refreshTree = useStore((s) => s.refreshTree)

  const [vaultId, setVaultId] = useState<string>(active?.vaultId ?? vaults[0]?.id ?? '')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<{ msg: string; pct?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [applied, setApplied] = useState<ApplyResult | null>(null)

  // resumo do processo: contagens + consumo de tokens/custo
  const [stats, setStats] = useState<{ docCount: number; codeCount: number } | null>(null)
  const [analyzeUsage, setAnalyzeUsage] = useState<LlmUsage | null>(null)
  const [reviewUsage, setReviewUsage] = useState<LlmUsage | null>(null)

  const [selected, setSelected] = useState<ProposedFile | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('content')
  const [currentContent, setCurrentContent] = useState<string>('')

  // progresso do main
  useEffect(() => {
    const off = window.api.onDocProgress((p) => setProgress(p))
    return off
  }, [])

  // verifica se há configuração de LLM
  useEffect(() => {
    void (async () => {
      const cfg = (await window.api.llmGetConfig()) as {
        hasToken: boolean
        modelPrimary: string
        modelReviewer: string
      }
      if (!cfg.hasToken || !cfg.modelPrimary || !cfg.modelReviewer) setPhase('config')
    })()
  }, [])

  const proposedTree = useMemo(
    () => (report ? buildProposedTree(report.proposedTree) : []),
    [report]
  )

  // carrega conteúdo atual do vault para o diff quando seleciona um arquivo
  useEffect(() => {
    if (!selected) return
    if (selected.status === 'created') {
      setCurrentContent('')
      return
    }
    void (async () => {
      try {
        const c = (await window.api.read(vaultId, selected.path)) as string
        setCurrentContent(c)
      } catch {
        setCurrentContent('')
      }
    })()
  }, [selected, vaultId])

  const runAnalysis = async (): Promise<void> => {
    if (!vaultId) return
    setPhase('analyzing')
    setError(null)
    setReport(null)
    setReview(null)
    setApplied(null)
    setSelected(null)
    setStats(null)
    setAnalyzeUsage(null)
    setReviewUsage(null)
    try {
      const r = (await window.api.docAnalyze(vaultId)) as AnalyzeResult
      setReport(r.report)
      setStats(r.stats)
      setAnalyzeUsage(r.usage)
      setPhase('report')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const runReview = async (): Promise<void> => {
    if (!report) return
    setPhase('reviewing')
    setError(null)
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
    const ok = await window.api.confirm(
      'Aplicar a nova estrutura de documentação? A documentação atual será copiada para uma pasta de backup antes.'
    )
    if (!ok) return
    setPhase('applying')
    setError(null)
    try {
      const res = (await window.api.docApply(vaultId, report)) as ApplyResult
      setApplied(res)
      await refreshTree(vaultId)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const fileByPath = (path: string): ProposedFile | undefined =>
    report?.proposedTree.find((f) => f.path === path)

  const busy = phase === 'analyzing' || phase === 'reviewing' || phase === 'applying'

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="doc-modal" onClick={(e) => e.stopPropagation()}>
        <header className="doc-modal-header">
          <span className="doc-modal-title">🤖 Análise de documentação por LLM</span>
          {vaults.length > 1 && (phase === 'idle' || phase === 'config') ? (
            <select value={vaultId} onChange={(e) => setVaultId(e.target.value)}>
              {vaults.map((v: Vault) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : null}
          <span className="doc-modal-spacer" />
          <button className="icon-btn" onClick={onClose} disabled={busy} title="Fechar">
            ✕
          </button>
        </header>

        <div className="doc-modal-body">
          {phase === 'config' ? (
            <div className="doc-center">
              <p>Configure o token do OpenRouter e os dois modelos (⚙ na barra lateral) antes de analisar.</p>
            </div>
          ) : phase === 'idle' ? (
            <div className="doc-center">
              <p>
                A LLM vai ler toda a documentação e o código deste vault, avaliar coesão e divergências
                doc↔código, e propor uma nova estrutura otimizada para instruir LLMs.
              </p>
              <button className="modal-btn-ok" onClick={() => void runAnalysis()}>
                Iniciar análise
              </button>
            </div>
          ) : busy && !report ? (
            <div className="doc-center">
              <div className="doc-spinner" />
              <p>{progress?.msg ?? 'Processando…'}</p>
              {progress?.pct != null ? (
                <div className="doc-progress">
                  <div className="doc-progress-bar" style={{ width: `${progress.pct}%` }} />
                </div>
              ) : null}
            </div>
          ) : phase === 'error' ? (
            <div className="doc-center">
              <p className="test-msg err">✗ {error}</p>
              <button className="modal-btn-cancel" onClick={() => setPhase('idle')}>
                Voltar
              </button>
            </div>
          ) : report ? (
            <div className="doc-split">
              {/* esquerda: relatório + árvore proposta */}
              <aside className="doc-left">
                <ReportSummary report={report} />
                <div className="doc-tree-title">Estrutura proposta</div>
                <div className="doc-tree">
                  {proposedTree.map((n) => (
                    <ProposedNode
                      key={n.path}
                      node={n}
                      depth={0}
                      selectedPath={selected?.path ?? null}
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

              {/* direita: conteúdo / diff */}
              <section className="doc-right">
                {selected ? (
                  <>
                    <div className="doc-right-head">
                      <span className="doc-right-path">{selected.path}</span>
                      <div className="doc-tabs">
                        <button
                          className={rightTab === 'content' ? 'active' : ''}
                          onClick={() => setRightTab('content')}
                        >
                          Conteúdo
                        </button>
                        <button
                          className={rightTab === 'diff' ? 'active' : ''}
                          onClick={() => setRightTab('diff')}
                        >
                          Diff
                        </button>
                      </div>
                    </div>
                    {selected.rationale ? (
                      <p className="doc-rationale">💡 {selected.rationale}</p>
                    ) : null}
                    {rightTab === 'content' ? (
                      <pre className="doc-content">{selected.content || '(vazio)'}</pre>
                    ) : (
                      <DiffView oldText={currentContent} newText={selected.content} />
                    )}
                  </>
                ) : (
                  <div className="doc-center">
                    <p>Selecione um arquivo na estrutura proposta.</p>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        {/* rodapé com ações de revisão/aplicação */}
        {report && phase !== 'error' ? (
          <footer className="doc-modal-footer">
            <UsageSummary
              report={report}
              stats={stats}
              analyzeUsage={analyzeUsage}
              reviewUsage={reviewUsage}
            />
            {review ? (
              <div className={`doc-review ${review.approved ? 'ok' : 'block'}`}>
                {review.approved ? (
                  <span>✓ Revisão de fallback aprovou a proposta.</span>
                ) : (
                  <span>✗ Revisão bloqueou ({review.blocking.length}):</span>
                )}
                {review.blocking.slice(0, 3).map((b, i) => (
                  <div key={i} className="doc-review-item">
                    • {b}
                  </div>
                ))}
                {review.notes.slice(0, 2).map((n, i) => (
                  <div key={i} className="doc-review-note">
                    {n}
                  </div>
                ))}
              </div>
            ) : null}

            {applied ? (
              <div className="doc-review ok">
                ✓ Aplicado. Backup em <code>{applied.backupDir}</code> · {applied.created.length} novos,{' '}
                {applied.updated.length} editados, {applied.removed.length} removidos.
              </div>
            ) : null}

            <div className="doc-footer-actions">
              <button className="modal-btn-cancel" onClick={onClose} disabled={busy}>
                Fechar
              </button>
              {!applied ? (
                <>
                  <button className="modal-btn-ok" onClick={() => void runReview()} disabled={busy}>
                    {phase === 'reviewing' ? 'Revisando…' : review ? 'Revisar de novo' : 'Revisar (2ª LLM)'}
                  </button>
                  <button
                    className="modal-btn-ok"
                    onClick={() => void runApply()}
                    disabled={busy || !review || !review.approved}
                    title={!review ? 'Rode a revisão de fallback primeiro' : ''}
                  >
                    {phase === 'applying' ? 'Aplicando…' : 'Aplicar'}
                  </button>
                </>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  )
}

/** Converte qualquer valor (string, objeto, etc.) em texto seguro para renderizar. */
function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v]
}

function fmtTokens(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
}
function fmtCost(usd: number): string {
  if (!usd) return '$0'
  if (usd < 0.01) return '$' + usd.toFixed(4)
  return '$' + usd.toFixed(usd < 1 ? 3 : 2)
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
  // contagem de mudanças propostas
  const counts = { created: 0, updated: 0, removed: 0, unchanged: 0 }
  for (const f of report.proposedTree) counts[f.status]++

  const totalIn = (analyzeUsage?.promptTokens ?? 0) + (reviewUsage?.promptTokens ?? 0)
  const totalOut = (analyzeUsage?.completionTokens ?? 0) + (reviewUsage?.completionTokens ?? 0)
  const totalCost = (analyzeUsage?.cost ?? 0) + (reviewUsage?.cost ?? 0)
  const calls = (analyzeUsage?.calls ?? 0) + (reviewUsage?.calls ?? 0)

  return (
    <details className="doc-usage" open>
      <summary>
        📊 Resumo — in {fmtTokens(totalIn)} · out {fmtTokens(totalOut)} tokens · ~{fmtCost(totalCost)}
      </summary>
      <div className="doc-usage-grid">
        <div>
          <span className="doc-usage-k">Lido</span>
          {stats ? `${stats.docCount} docs · ${stats.codeCount} arquivos de código` : '—'}
        </div>
        <div>
          <span className="doc-usage-k">Proposta</span>
          {counts.created} novos · {counts.updated} editados · {counts.removed} removidos ·{' '}
          {counts.unchanged} mantidos
        </div>
        <div>
          <span className="doc-usage-k">Análise</span>
          {analyzeUsage
            ? `in ${fmtTokens(analyzeUsage.promptTokens)} / out ${fmtTokens(analyzeUsage.completionTokens)} · ~${fmtCost(analyzeUsage.cost)}`
            : '—'}
        </div>
        <div>
          <span className="doc-usage-k">Revisão</span>
          {reviewUsage
            ? `in ${fmtTokens(reviewUsage.promptTokens)} / out ${fmtTokens(reviewUsage.completionTokens)} · ~${fmtCost(reviewUsage.cost)}`
            : '(ainda não executada)'}
        </div>
        <div>
          <span className="doc-usage-k">Total</span>
          {calls} chamada{calls === 1 ? '' : 's'} · in {fmtTokens(totalIn)} / out {fmtTokens(totalOut)}{' '}
          tokens · <strong>~{fmtCost(totalCost)}</strong>
        </div>
      </div>
    </details>
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
      {section('Coesão', report.coherence)}
      {section('Contradições', report.contradictions)}
      {section('Duplicações', report.duplications)}
      {mismatches.length ? (
        <details className="doc-report-sec" open>
          <summary>
            Divergências doc↔código <span className="doc-count">{mismatches.length}</span>
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
  onSelect
}: {
  node: ProposedTreeNode
  depth: number
  selectedPath: string | null
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
              <ProposedNode key={c.path} node={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
            ))
          : null}
      </div>
    )
  }

  const isActive = selectedPath === node.path
  return (
    <div
      className={`doc-tree-row file ${isActive ? 'active' : ''} ${node.status === 'removed' ? 'removed' : ''}`}
      style={{ paddingLeft: depth * 12 + 20 }}
      onClick={() => onSelect(node.path)}
    >
      <span className="tree-label">{node.name}</span>
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
