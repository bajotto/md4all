import { useStore } from '../store/useStore'
import Logo from './Logo'

export default function Welcome(): JSX.Element {
  const vaults = useStore((s) => s.vaults)
  const addVaultFromPicker = useStore((s) => s.addVaultFromPicker)

  return (
    <div className="welcome">
      <Logo size={56} />
      <h1 className="welcome-title">md4all</h1>
      <p className="welcome-sub">Editor Markdown WYSIWYG — local, iCloud, SMB ou SSH/SFTP</p>
      {vaults.length === 0 ? (
        <>
          <button className="btn-primary welcome-cta" onClick={() => void addVaultFromPicker()}>
            Adicionar vault…
          </button>
          <p className="welcome-hint">
            A pasta pode estar no disco local, iCloud Drive, um share SMB montado
            ou um servidor remoto via SSH/SFTP.
          </p>
        </>
      ) : (
        <p className="welcome-hint">Selecione ou crie um arquivo na barra lateral para começar a editar.</p>
      )}
    </div>
  )
}
