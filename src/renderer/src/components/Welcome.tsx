import { useStore } from '../store/useStore'
import Logo from './Logo'

export default function Welcome(): JSX.Element {
  const vaults = useStore((s) => s.vaults)
  const addVaultFromPicker = useStore((s) => s.addVaultFromPicker)

  return (
    <div className="welcome">
      <Logo size={56} />
      <h1 className="welcome-title">md4all</h1>
      <p className="welcome-sub">WYSIWYG Markdown editor — local, iCloud, SMB or SSH/SFTP</p>
      {vaults.length === 0 ? (
        <>
          <button className="btn-primary welcome-cta" onClick={() => void addVaultFromPicker()}>
            Add vault…
          </button>
          <p className="welcome-hint">
            The folder can be on local disk, iCloud Drive, a mounted SMB share
            or a remote server via SSH/SFTP.
          </p>
        </>
      ) : (
        <p className="welcome-hint">Select or create a file in the sidebar to start editing.</p>
      )}
    </div>
  )
}
