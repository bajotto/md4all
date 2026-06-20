import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import MilkdownCrepe, { type EditorApi } from './MilkdownCrepe'
import CodeMirrorSource from './CodeMirrorSource'
import FormatToolbar from './FormatToolbar'
import Toolbar from './Toolbar'
import { tabKey } from '../../types'

const AUTOSAVE_MS = 600

export default function Editor(): JSX.Element | null {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.active)
  const editorMode = useStore((s) => s.editorMode)
  const updateContent = useStore((s) => s.updateContent)
  const saveTab = useStore((s) => s.saveTab)

  const tab = active ? tabs.find((t) => t.vaultId === active.vaultId && t.path === active.path) : undefined
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorApi = useRef<EditorApi | null>(null)

  const activeKey = active ? tabKey(active.vaultId, active.path) : ''

  const scheduleSave = useCallback(
    (vaultId: string, path: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void saveTab(vaultId, path), AUTOSAVE_MS)
    },
    [saveTab]
  )

  // salva pendências ao trocar de arquivo / desmontar
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (active) void saveTab(active.vaultId, active.path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, saveTab])

  // Ctrl/Cmd+S salva imediatamente
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (active) void saveTab(active.vaultId, active.path)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeKey, active, saveTab])

  const handleChange = useCallback(
    (markdown: string) => {
      if (!active) return
      updateContent(active.vaultId, active.path, markdown)
      scheduleSave(active.vaultId, active.path)
    },
    [active, updateContent, scheduleSave]
  )

  if (!tab || !active) return null

  return (
    <div className="editor">
      <Toolbar fileName={tab.name} dirty={tab.dirty} />
      {editorMode === 'wysiwyg' ? (
        <FormatToolbar apiRef={editorApi} vaultId={active.vaultId} />
      ) : null}
      <div className="editor-surface">
        {editorMode === 'wysiwyg' ? (
          <MilkdownCrepe
            key={`wys:${activeKey}`}
            vaultId={active.vaultId}
            initialContent={tab.content}
            onChange={handleChange}
            apiRef={editorApi}
          />
        ) : (
          <CodeMirrorSource
            key={`src:${activeKey}`}
            initialContent={tab.content}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  )
}
