import { useState } from 'react'
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
      setTestMsg('✓ Conexão OK')
    } catch (err) {
      setTestMsg('✗ ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    let ok = false
    if (mode === 'local') {
      if (path.trim()) ok = await addVaultByPath(path.trim())
    } else if (sftpValid) {
      ok = await addSftpVault(buildInput())
    }
    setBusy(false)
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
        <p className="modal-title">Adicionar vault</p>

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
              Pasta no disco, share SMB montado (<code>/Volumes/meu-share</code>) ou iCloud Drive.
            </p>
            <input
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
          </>
        ) : (
          <>
            <input className="modal-input" placeholder="Nome (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="field-row">
              <input className="modal-input flex2" placeholder="Host (ex.: 34.73.89.87)" value={host} onChange={(e) => setHost(e.target.value)} />
              <input className="modal-input flex1" placeholder="Porta" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
            <input className="modal-input" placeholder="Usuário" value={username} onChange={(e) => setUsername(e.target.value)} />

            <div className="mode-toggle auth-toggle">
              <button className={auth === 'password' ? 'active' : ''} onClick={() => setAuth('password')}>Senha</button>
              <button className={auth === 'key' ? 'active' : ''} onClick={() => setAuth('key')}>Chave / Certificado</button>
            </div>

            {auth === 'password' ? (
              <input className="modal-input" type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
            ) : (
              <>
                <div className="field-row">
                  <input className="modal-input flex2" placeholder="Caminho da chave privada (.pem, id_rsa)" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} />
                  <button className="inline-btn" onClick={() => void pickKey()}>Procurar…</button>
                </div>
                <input className="modal-input" type="password" placeholder="Passphrase da chave (se houver)" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </>
            )}

            <div className="field-row">
              <input className="modal-input flex2" placeholder="Pasta raiz remota (ex.: /home/user/notas ou .)" value={rootPath} onChange={(e) => setRootPath(e.target.value)} />
              <button className="inline-btn" disabled={!sftpValid || busy} onClick={() => setBrowsing(true)} title="Navegar no servidor">
                📁 Procurar…
              </button>
            </div>

            <div className="add-vault-shortcuts">
              <button disabled={!sftpValid || busy} onClick={() => void testSftp()}>
                {busy ? '…' : '🔌 Testar conexão'}
              </button>
              {testMsg ? <span className={`test-msg ${testMsg.startsWith('✓') ? 'ok' : 'err'}`}>{testMsg}</span> : null}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancelar</button>
          <button
            className="modal-btn-ok"
            disabled={busy || (mode === 'local' ? !path.trim() : !sftpValid)}
            onClick={() => void submit()}
          >
            {busy ? 'Conectando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
