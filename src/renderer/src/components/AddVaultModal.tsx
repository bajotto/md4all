import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import RemoteDirPicker from './RemoteDirPicker'
import type { SftpInput } from '../types'

interface Props {
  onClose: () => void
}

type Mode = 'local' | 'sftp'

export default function AddVaultModal({ onClose }: Props): JSX.Element {
  const addVaultByPath = useStore((s) => s.addVaultByPath)
  const addSftpVault = useStore((s) => s.addSftpVault)
  const [mode, setMode] = useState<Mode>('local')
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  // synchronous guard against double-submit (`busy` state updates too late for double-click)
  const submitting = useRef(false)

  // local
  const [path, setPath] = useState('')

  // sftp
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [auth, setAuth] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState('')
  const [keyPath, setKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [rootPath, setRootPath] = useState('.')

  const buildInput = (): SftpInput => ({
    name: name.trim(),
    host: host.trim(),
    port: Number(port) || 22,
    username: username.trim(),
    password: auth === 'password' ? password : undefined,
    privateKeyPath: auth === 'key' ? keyPath.trim() : undefined,
    passphrase: auth === 'key' ? passphrase : undefined,
    rootPath: rootPath.trim() || '.'
  })

  const sftpValid = host.trim() && username.trim() && (auth === 'password' ? password : keyPath.trim())

  const pickFolder = async (): Promise<void> => {
    const picked = (await window.api.pickFolder()) as { path: string } | null
    if (picked) setPath(picked.path)
  }
  const fillIcloud = async (): Promise<void> => {
    setPath((await window.api.icloudPath()) as string)
  }
  const pickKey = async (): Promise<void> => {
    const p = (await window.api.pickKey()) as string | null
    if (p) setKeyPath(p)
  }

  const testSftp = async (): Promise<void> => {
    setBusy(true)
    setTestMsg(null)
    try {
      await window.api.testSftp(buildInput())
      setTestMsg('✓ Connection OK')
    } catch (err) {
      setTestMsg('✗ ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    let ok = false
    try {
      if (mode === 'local') {
        if (path.trim()) ok = await addVaultByPath(path.trim())
      } else if (sftpValid) {
        ok = await addSftpVault(buildInput())
      }
    } finally {
      setBusy(false)
      submitting.current = false
    }
    if (ok) onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      {browsing ? (
        <RemoteDirPicker
          input={buildInput()}
          initialPath={rootPath.trim() && rootPath.trim() !== '.' ? rootPath.trim() : undefined}
          onPick={(p) => setRootPath(p)}
          onClose={() => setBrowsing(false)}
        />
      ) : null}
      <div className="modal-box add-vault" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title">Add vault</p>

        <div className="mode-toggle vault-mode">
          <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>
            💾 Local / SMB / iCloud
          </button>
          <button className={mode === 'sftp' ? 'active' : ''} onClick={() => setMode('sftp')}>
            🌐 SSH / SFTP
          </button>
        </div>

        {mode === 'local' ? (
          <>
            <p className="modal-help">
              Folder on disk, mounted SMB share (<code>/Volumes/my-share</code>) or iCloud Drive.
            </p>
            <input
              className="modal-input"
              value={path}
              placeholder="/path/to/folder"
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
                if (e.key === 'Escape') onClose()
              }}
            />
            <div className="add-vault-shortcuts">
              <button onClick={() => void pickFolder()}>📁 Choose folder…</button>
              <button onClick={() => void fillIcloud()}>☁️ iCloud Drive</button>
            </div>
          </>
        ) : (
          <>
            <input className="modal-input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="field-row">
              <input className="modal-input flex2" placeholder="Host (e.g. 0.0.0.0)" value={host} onChange={(e) => setHost(e.target.value)} />
              <input className="modal-input flex1" placeholder="Port" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
            <input className="modal-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />

            <div className="mode-toggle auth-toggle">
              <button className={auth === 'password' ? 'active' : ''} onClick={() => setAuth('password')}>Password</button>
              <button className={auth === 'key' ? 'active' : ''} onClick={() => setAuth('key')}>Key / Certificate</button>
            </div>

            {auth === 'password' ? (
              <input className="modal-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            ) : (
              <>
                <div className="field-row">
                  <input className="modal-input flex2" placeholder="Private key path (.pem, id_rsa)" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} />
                  <button className="inline-btn" onClick={() => void pickKey()}>Browse…</button>
                </div>
                <input className="modal-input" type="password" placeholder="Key passphrase (if any)" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </>
            )}

            <div className="field-row">
              <input className="modal-input flex2" placeholder="Remote root folder (e.g. /home/user/notes or .)" value={rootPath} onChange={(e) => setRootPath(e.target.value)} />
              <button className="inline-btn" disabled={!sftpValid || busy} onClick={() => setBrowsing(true)} title="Browse server">
                📁 Browse…
              </button>
            </div>

            <div className="add-vault-shortcuts">
              <button disabled={!sftpValid || busy} onClick={() => void testSftp()}>
                {busy ? '…' : '🔌 Test connection'}
              </button>
              {testMsg ? <span className={`test-msg ${testMsg.startsWith('✓') ? 'ok' : 'err'}`}>{testMsg}</span> : null}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-ok"
            disabled={busy || (mode === 'local' ? !path.trim() : !sftpValid)}
            onClick={() => void submit()}
          >
            {busy ? 'Connecting…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
