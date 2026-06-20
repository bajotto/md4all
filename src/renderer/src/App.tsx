import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar/Sidebar'
import Tabs from './components/Tabs/Tabs'
import Editor from './components/Editor/Editor'
import Welcome from './components/Welcome'

export default function App(): JSX.Element {
  const init = useStore((s) => s.init)
  const vaults = useStore((s) => s.vaults)
  const active = useStore((s) => s.active)
  const refreshTree = useStore((s) => s.refreshTree)
  const reloadTabFromDisk = useStore((s) => s.reloadTabFromDisk)

  useEffect(() => {
    void init()
  }, [init])

  // reage a mudanças externas no filesystem (chokidar -> IPC), por vault
  useEffect(() => {
    const off = window.api.onFsEvent((evt) => {
      void refreshTree(evt.vaultId)
      if (evt.type === 'change') void reloadTabFromDisk(evt.vaultId, evt.path)
    })
    return off
  }, [refreshTree, reloadTabFromDisk])

  return (
    <div className="app">
      <Sidebar />
      <main className="workspace">
        {vaults.length === 0 ? (
          <Welcome />
        ) : (
          <>
            <Tabs />
            {active ? <Editor /> : <Welcome />}
          </>
        )}
      </main>
    </div>
  )
}
