import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { useLlmConfigured } from './shared'
import AuditView from './AuditView'
import AgentsView from './AgentsView'
import RewriteView from './RewriteView'
import type { Vault } from '../../types'

interface Props {
  onClose: () => void
}

type Mode = 'audit' | 'agents' | 'rewrite'

const TABS: { id: Mode; label: string }[] = [
  { id: 'audit', label: 'Audit' },
  { id: 'agents', label: 'Agent context' },
  { id: 'rewrite', label: 'Rewrite (advanced)' }
]

export default function DocAnalysisModal({ onClose }: Props): JSX.Element {
  const vaults = useStore((s) => s.vaults)
  const active = useStore((s) => s.active)
  const configured = useLlmConfigured()

  const [vaultId, setVaultId] = useState<string>(active?.vaultId ?? vaults[0]?.id ?? '')
  const [mode, setMode] = useState<Mode>('audit')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="doc-modal" onClick={(e) => e.stopPropagation()}>
        <header className="doc-modal-header">
          <span className="doc-modal-title">🤖 Documentation for agents</span>
          {vaults.length > 1 ? (
            <select value={vaultId} onChange={(e) => setVaultId(e.target.value)}>
              {vaults.map((v: Vault) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="doc-mode-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={mode === t.id ? 'active' : ''} onClick={() => setMode(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="doc-modal-spacer" />
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </header>

        <div className="doc-modal-body">
          {configured === false ? (
            <div className="doc-center">
              <p>Configure the OpenRouter token and both models (⚙ in the sidebar) before using.</p>
            </div>
          ) : !vaultId ? (
            <div className="doc-center">
              <p>No vault selected.</p>
            </div>
          ) : mode === 'audit' ? (
            <AuditView key={vaultId + ':audit'} vaultId={vaultId} />
          ) : mode === 'agents' ? (
            <AgentsView key={vaultId + ':agents'} vaultId={vaultId} />
          ) : (
            <RewriteView key={vaultId + ':rewrite'} vaultId={vaultId} />
          )}
        </div>
      </div>
    </div>
  )
}
