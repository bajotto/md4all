import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

interface Props {
  onClose: () => void
}

/**
 * Modal para adicionar um vault. Aceita 3 caminhos:
 *  - escolher pasta via diálogo nativo;
 *  - colar um caminho manualmente (ideal para SMB montado em /Volumes/<share>);
 *  - preencher automaticamente o caminho do iCloud Drive.
 */
export default function AddVaultModal({ onClose }: Props): JSX.Element {
  const addVaultByPath = useStore((s) => s.addVaultByPath)
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const pickFolder = async (): Promise<void> => {
    const picked = (await window.api.pickFolder()) as { path: string } | null
    if (picked) setPath(picked.path)
  }

  const fillIcloud = async (): Promise<void> => {
    const p = (await window.api.icloudPath()) as string
    setPath(p)
  }

  const submit = async (): Promise<void> => {
    if (!path.trim() || busy) return
    setBusy(true)
    const ok = await addVaultByPath(path.trim())
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box add-vault" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">Adicionar vault</p>
        <p className="modal-help">
          Aponte para uma pasta no disco, um share SMB montado (ex.:{' '}
          <code>/Volumes/meu-share</code>) ou o iCloud Drive.
        </p>
        <input
          ref={inputRef}
          className="modal-input"
          value={path}
          placeholder="/caminho/para/a/pasta"
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="add-vault-shortcuts">
          <button onClick={() => void pickFolder()}>📁 Escolher pasta…</button>
          <button onClick={() => void fillIcloud()}>☁️ iCloud Drive</button>
        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="modal-btn-ok" disabled={!path.trim() || busy} onClick={() => void submit()}>
            {busy ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
