import { useEffect } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar/Sidebar'
import Tabs from './components/Tabs/Tabs'
import Editor from './components/Editor/Editor'
import Welcome from './components/Welcome'
import Splash from './components/Splash'
import SearchPanel from './components/SearchPanel/SearchPanel'
import LlmSettingsModal from './components/LlmSettingsModal'

export default function App(): JSX.Element {
  const init = useStore((s) => s.init)
  const vaults = useStore((s) => s.vaults)
  const active = useStore((s) => s.active)
  const refreshTree = useStore((s) => s.refreshTree)
  const reloadTabFromDisk = useStore((s) => s.reloadTabFromDisk)
  const loadBacklinks = useStore((s) => s.loadBacklinks)
  const openSearchPanel = useStore((s) => s.openSearchPanel)
  const llmSettingsOpen = useStore((s) => s.llmSettingsOpen)
  const setLlmSettingsOpen = useStore((s) => s.setLlmSettingsOpen)

  useEffect(() => {
    void init()
  }, [init])

  // Cmd/Ctrl+F and "Find" menu open the global search panel
  // Cmd/Ctrl+Shift+F also opens (alternative shortcut)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openSearchPanel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openSearchPanel])

  // native "Find" menu → search drawer; "Replace" → FindBar (in Editor)
  useEffect(() => {
    const off = window.api.onMenu((cmd) => {
      if (cmd === 'find') openSearchPanel()
    })
    return off
  }, [openSearchPanel])

  // reacts to external filesystem changes (chokidar -> IPC), per vault
  useEffect(() => {
    const off = window.api.onFsEvent((evt) => {
      void refreshTree(evt.vaultId)
      if (evt.type === 'change') void reloadTabFromDisk(evt.vaultId, evt.path)
      void loadBacklinks()
    })
    return off
  }, [refreshTree, reloadTabFromDisk, loadBacklinks])

  return (
    <>
      <Splash />
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
        <SearchPanel />
      </div>
      {llmSettingsOpen ? <LlmSettingsModal onClose={() => setLlmSettingsOpen(false)} /> : null}
    </>
  )
}
