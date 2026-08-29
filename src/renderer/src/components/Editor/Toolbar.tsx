import { useStore } from '../../store/useStore'
import type { EditorMode } from '../../types'

interface Props {
  fileName: string
  dirty: boolean
}

export default function Toolbar({ fileName, dirty }: Props): JSX.Element {
  const editorMode = useStore((s) => s.editorMode)
  const setEditorMode = useStore((s) => s.setEditorMode)
  const exportActive = useStore((s) => s.exportActive)
  const outlineOpen = useStore((s) => s.outlineOpen)
  const toggleOutline = useStore((s) => s.toggleOutline)
  const searchPanelOpen = useStore((s) => s.searchPanelOpen)
  const toggleSearchPanel = useStore((s) => s.toggleSearchPanel)

  const select = (mode: EditorMode): void => setEditorMode(mode)

  const handleExport = async (format: 'html' | 'pdf'): Promise<void> => {
    const saved = await exportActive(format)
    if (saved) await window.api.confirm(`Exported to:\n${saved}`)
  }

  return (
    <div className="editor-toolbar">
      <div className="editor-title">
        <span className="editor-name">{fileName}</span>
        {dirty ? <span className="dot-dirty" title="Unsaved" /> : null}
      </div>
      <div className="toolbar-right">
        <button
          className={`outline-toggle${searchPanelOpen ? ' active' : ''}`}
          onClick={toggleSearchPanel}
          title="Search (Cmd/Ctrl+F)"
        >
          🔍 Search
        </button>
        <button
          className={`outline-toggle${outlineOpen ? ' active' : ''}`}
          onClick={toggleOutline}
          title="Show/hide outline"
        >
          ☰ Topics
        </button>
        <div className="export-group">
          <button onClick={() => void handleExport('pdf')} title="Export to PDF">
            PDF
          </button>
          <button onClick={() => void handleExport('html')} title="Export to HTML">
            HTML
          </button>
        </div>
        <div className="mode-toggle" role="group" aria-label="Edit mode">
          <button
            className={editorMode === 'wysiwyg' ? 'active' : ''}
            onClick={() => select('wysiwyg')}
          >
            WYSIWYG
          </button>
          <button
            className={editorMode === 'source' ? 'active' : ''}
            onClick={() => select('source')}
          >
            Source
          </button>
        </div>
      </div>
    </div>
  )
}
