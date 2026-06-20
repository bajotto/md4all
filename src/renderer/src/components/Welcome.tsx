import { useStore } from '../store/useStore'

export default function Welcome(): JSX.Element {
  const vaults = useStore((s) => s.vaults)
  const addVaultFromPicker = useStore((s) => s.addVaultFromPicker)

  return (
    <div className="welcome">
      <h1>md4all</h1>
      <p className="welcome-sub">Editor Markdown WYSIWYG — local, iCloud, SMB ou SSH/SFTP</p>
      {vaults.length === 0 ? (
        <>
          <p>Para começar, adicione um vault (uma pasta com seus arquivos .md).</p>
          <button className="btn-primary" onClick={() => void addVaultFromPicker()}>
            Adicionar vault…
          </button>
          <p className="welcome-hint">
            A pasta pode estar no disco local, iCloud Drive, um share SMB montado, ou um servidor
            remoto via SSH/SFTP (botão “+ Adicionar vault” na barra lateral).
          </p>
        </>
      ) : (
        <p>Selecione ou crie um arquivo na barra lateral para começar a editar.</p>
      )}
    </div>
  )
}
