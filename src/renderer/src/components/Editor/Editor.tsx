import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import MilkdownCrepe from './MilkdownCrepe'
import CodeMirrorSource from './CodeMirrorSource'
import Toolbar from './Toolbar'

const AUTOSAVE_MS = 600

export default function Editor(): JSX.Element | null {
  const activeVaultId = useStore((s) => s.activeVaultId)
  const activePath = useStore((s) => s.activePath)
  const tabs = useStore((s) => s.tabs)
  const editorMode = useStore((s) => s.editorMode)
  const updateContent = useStore((s) => s.updateContent)
  const saveTab = useStore((s) => s.saveTab)

  const tab = tabs.find((t) => t.path === activePath)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback(
    (path: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void saveTab(path), AUTOSAVE_MS)
    },
    [saveTab]
  )

  // salva pendências ao trocar de arquivo / desmontar
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (activePath) void saveTab(activePath)
    }
  }, [activePath, saveTab])

  // Ctrl/Cmd+S salva imediatamente
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (activePath) void saveTab(activePath)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePath, saveTab])

  const handleChange = useCallback(
    (markdown: string) => {
      if (!activePath) return
      updateContent(activePath, markdown)
      scheduleSave(activePath)
    },
    [activePath, updateContent, scheduleSave]
  )

  if (!tab || !activeVaultId) return null

  return (
    <div className="editor">
      <Toolbar fileName={tab.name} dirty={tab.dirty} />
      <div className="editor-surface">
        {editorMode === 'wysiwyg' ? (
          <MilkdownCrepe
            key={`wys:${tab.path}`}
            vaultId={activeVaultId}
            initialContent={tab.content}
            onChange={handleChange}
          />
        ) : (
          <CodeMirrorSource
            key={`src:${tab.path}`}
            initialContent={tab.content}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  )
}
