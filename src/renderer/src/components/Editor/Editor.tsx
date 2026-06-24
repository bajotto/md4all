import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import MilkdownCrepe, { type EditorApi } from './MilkdownCrepe'
import CodeMirrorSource, { type SourceNav } from './CodeMirrorSource'
import FormatToolbar from './FormatToolbar'
import FindBar from './FindBar'
import Toolbar from './Toolbar'
import Outline from '../Outline/Outline'
import Backlinks from '../Outline/Backlinks'
import { tabKey } from '../../types'
import { parseOutline, type OutlineItem } from '../../editor/outline'
import type { SearchController } from '../../editor/search'

const AUTOSAVE_MS = 600

export default function Editor(): JSX.Element | null {
  const tabs = useStore((s) => s.tabs)
  const active = useStore((s) => s.active)
  const editorMode = useStore((s) => s.editorMode)
  const updateContent = useStore((s) => s.updateContent)
  const saveTab = useStore((s) => s.saveTab)
  const reloadTabFromDisk = useStore((s) => s.reloadTabFromDisk)
  const outlineOpen = useStore((s) => s.outlineOpen)
  const backlinks = useStore((s) => s.backlinks)
  const openWikilink = useStore((s) => s.openWikilink)
  const filterByTag = useStore((s) => s.filterByTag)
  const openFile = useStore((s) => s.openFile)

  const tab = active ? tabs.find((t) => t.vaultId === active.vaultId && t.path === active.path) : undefined
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorApi = useRef<EditorApi | null>(null)
  const cmSearch = useRef<SearchController | null>(null)
  const cmNav = useRef<SourceNav | null>(null)

  const outline = useMemo(() => parseOutline(tab?.content ?? ''), [tab?.content])

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

  const handleOutlineSelect = useCallback(
    (item: OutlineItem) => {
      if (editorMode === 'wysiwyg') editorApi.current?.scrollToHeading(item.index)
      else cmNav.current?.goToLine(item.line)
    },
    [editorMode]
  )

  if (!tab || !active) return null

  const showOutline = outlineOpen && outline.length > 0
  const showAside = showOutline || backlinks.length > 0

  return (
    <div className="editor">
      <Toolbar fileName={tab.name} dirty={tab.dirty} />
      {tab.stale ? (
        <div
          style={{
            background: '#ffeaa7',
            color: '#333',
            padding: '8px 12px',
            fontSize: '13px',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>⚠️ Arquivo foi modificado no disco. </span>
          <button
            onClick={() => void reloadTabFromDisk(active.vaultId, active.path)}
            style={{ marginLeft: '12px', padding: '4px 8px', cursor: 'pointer' }}
          >
            Recarregar
          </button>
        </div>
      ) : null}
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
      <div className="editor-body">
        <div className="editor-surface">
          {editorMode === 'wysiwyg' ? (
            <MilkdownCrepe
              key={`wys:${activeKey}`}
              vaultId={active.vaultId}
              initialContent={tab.content}
              onChange={handleChange}
              apiRef={editorApi}
              onWikilink={(t) => void openWikilink(t)}
              onTag={(t) => void filterByTag(t)}
            />
          ) : (
            <CodeMirrorSource
              key={`src:${activeKey}`}
              initialContent={tab.content}
              onChange={handleChange}
              searchRef={cmSearch}
              navRef={cmNav}
            />
          )}
        </div>
        {showAside ? (
          <div className="editor-aside">
            {showOutline ? <Outline items={outline} onSelect={handleOutlineSelect} /> : null}
            {backlinks.length > 0 ? (
              <Backlinks
                items={backlinks}
                onSelect={(ref) => void openFile(active.vaultId, ref.path)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
