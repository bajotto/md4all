import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import MilkdownCrepe, { type EditorApi } from './MilkdownCrepe'
import CodeMirrorSource from './CodeMirrorSource'
import FormatToolbar from './FormatToolbar'
import FindBar from './FindBar'
import Toolbar from './Toolbar'
import { tabKey } from '../../types'
import type { SearchController } from '../../editor/search'

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
  const cmSearch = useRef<SearchController | null>(null)

  const [findOpen, setFindOpen] = useState(false)
  const [findReplace, setFindReplace] = useState(false)

  const activeKey = active ? tabKey(active.vaultId, active.path) : ''

  const getController = useCallback(
    (): SearchController | null =>
      editorMode === 'wysiwyg' ? editorApi.current?.search ?? null : cmSearch.current,
    [editorMode]
  )

  const scheduleSave = useCallback(
    (vaultId: string, path: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void saveTab(vaultId, path), AUTOSAVE_MS)
    },
    [saveTab]
  )

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (active) void saveTab(active.vaultId, active.path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, saveTab])

  // atalhos: Cmd/Ctrl+S salva, Cmd/Ctrl+F abre busca, Cmd/Ctrl+Alt+F substituição
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (active) void saveTab(active.vaultId, active.path)
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFindReplace(e.altKey)
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, saveTab])

  // comandos vindos do menu nativo (Edit -> Localizar / Substituir)
  useEffect(() => {
    const off = window.api.onMenu((cmd) => {
      if (cmd === 'find') {
        setFindReplace(false)
        setFindOpen(true)
      } else if (cmd === 'replace') {
        setFindReplace(true)
        setFindOpen(true)
      }
    })
    return off
  }, [])

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
      {findOpen ? (
        <FindBar
          getController={getController}
          revision={`${activeKey}:${editorMode}`}
          startWithReplace={findReplace}
          onClose={() => setFindOpen(false)}
        />
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
            searchRef={cmSearch}
          />
        )}
      </div>
    </div>
  )
}
