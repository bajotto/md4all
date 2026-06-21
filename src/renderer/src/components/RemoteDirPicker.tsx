import { useEffect, useState } from 'react'
import type { SftpInput } from '../types'

interface BrowseResult {
  path: string
  parent: string | null
  dirs: { name: string; path: string }[]
  fileCount: number
}

interface Props {
  input: SftpInput
  initialPath?: string
  onPick: (path: string) => void
  onClose: () => void
}

/** Navegador gráfico do FS remoto (um nível por vez) para escolher a pasta raiz. */
export default function RemoteDirPicker({ input, initialPath, onPick, onClose }: Props): JSX.Element {
  const [data, setData] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const go = async (remotePath?: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const r = (await window.api.browseSftp(input, remotePath)) as BrowseResult
      setData(r)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      // remove o ruído do wrapper de IPC do Electron
      setError(raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void go(initialPath)
    // fecha a conexão transitória ao desmontar
    return () => {
      void window.api.browseSftpClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = (): void => {
    void window.api.browseSftpClose()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box rdir" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">Escolher pasta raiz remota</p>

        <div className="rdir-bar">
          <button className="inline-btn" disabled={!data?.parent || loading} onClick={() => void go(data?.parent ?? undefined)}>
            ↑ Subir
          </button>
          <span className="rdir-path" title={data?.path}>
            {loading && !data ? 'conectando…' : (data?.path ?? '')}
          </span>
          <button className="inline-btn" disabled={loading} onClick={() => void go(data?.path)}>
            ↻
          </button>
        </div>

        <div className="rdir-list">
          {error ? (
            <div className="test-msg err" style={{ display: 'block', padding: 8 }}>
              ✗ {error}
            </div>
          ) : loading ? (
            <p className="tree-empty">Carregando…</p>
          ) : !data || data.dirs.length === 0 ? (
            <p className="tree-empty">
              (sem subpastas{data ? ` · ${data.fileCount} arquivo(s) aqui` : ''})
            </p>
          ) : (
            data.dirs.map((d) => (
              <div key={d.path} className="rdir-row" onDoubleClick={() => void go(d.path)} onClick={() => void go(d.path)}>
                <span className="rdir-icon">📁</span>
                <span className="tree-label">{d.name}</span>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={close}>
            Cancelar
          </button>
          <button
            className="modal-btn-ok"
            disabled={!data || loading}
            onClick={() => {
              if (data) {
                onPick(data.path)
                close()
              }
            }}
          >
            Usar esta pasta
          </button>
        </div>
      </div>
    </div>
  )
}
