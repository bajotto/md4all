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

  const select = (mode: EditorMode): void => setEditorMode(mode)

  const handleExport = async (format: 'html' | 'pdf'): Promise<void> => {
    const saved = await exportActive(format)
    if (saved) await window.api.confirm(`Exportado para:\n${saved}`)
  }

  return (
    <div className="editor-toolbar">
      <div className="editor-title">
        <span className="editor-name">{fileName}</span>
        {dirty ? <span className="dot-dirty" title="Não salvo" /> : null}
      </div>
      <div className="toolbar-right">
        <button
          className={`outline-toggle${outlineOpen ? ' active' : ''}`}
          onClick={toggleOutline}
          title="Mostrar/ocultar sumário"
        >
          ☰ Tópicos
        </button>
        <div className="export-group">
          <button onClick={() => void handleExport('pdf')} title="Exportar para PDF">
            PDF
          </button>
          <button onClick={() => void handleExport('html')} title="Exportar para HTML">
            HTML
          </button>
        </div>
        <div className="mode-toggle" role="group" aria-label="Modo de edição">
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
            Código
          </button>
        </div>
      </div>
    </div>
  )
}
