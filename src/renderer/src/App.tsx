import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar/Sidebar'
import Tabs from './components/Tabs/Tabs'
import Editor from './components/Editor/Editor'
import Welcome from './components/Welcome'

export default function App(): JSX.Element {
  const init = useStore((s) => s.init)
  const activeVaultId = useStore((s) => s.activeVaultId)
  const activePath = useStore((s) => s.activePath)
  const refreshTree = useStore((s) => s.refreshTree)
  const reloadTabFromDisk = useStore((s) => s.reloadTabFromDisk)

  useEffect(() => {
    void init()
  }, [init])

  // reage a mudanças externas no filesystem (chokidar -> IPC)
  useEffect(() => {
    const off = window.api.onFsEvent((evt) => {
      void refreshTree()
      if (evt.type === 'change') void reloadTabFromDisk(evt.path)
    })
    return off
  }, [refreshTree, reloadTabFromDisk])

  return (
    <div className="app">
      <Sidebar />
      <main className="workspace">
        {!activeVaultId ? (
          <Welcome />
        ) : (
          <>
            <Tabs />
            {activePath ? <Editor /> : <Welcome />}
          </>
        )}
      </main>
    </div>
  )
}
