import { useStore } from '../store/useStore'

export default function Welcome(): JSX.Element {
  const activeVaultId = useStore((s) => s.activeVaultId)
  const addVaultFromPicker = useStore((s) => s.addVaultFromPicker)

  return (
    <div className="welcome">
      <h1>md4all</h1>
      <p className="welcome-sub">Editor Markdown WYSIWYG — local, iCloud ou SMB</p>
      {!activeVaultId ? (
        <>
          <p>Para começar, adicione um vault (uma pasta com seus arquivos .md).</p>
          <button className="btn-primary" onClick={() => void addVaultFromPicker()}>
            Adicionar vault…
          </button>
          <p className="welcome-hint">
            A pasta pode estar no disco local, no iCloud Drive ou em um share SMB já montado no
            sistema.
          </p>
        </>
      ) : (
        <p>Selecione ou crie um arquivo na barra lateral para começar a editar.</p>
      )}
    </div>
  )
}
