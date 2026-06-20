import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm'
import { applyColorCommand } from '../../editor/colorMark'
import type { EditorApi } from './MilkdownCrepe'

// paleta padrão do seletor de cor (funciona em tema claro e escuro)
const PALETTE = [
  '#e11d48',
  '#ea580c',
  '#d97706',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#64748b',
  '#111827'
]

interface Props {
  apiRef: MutableRefObject<EditorApi | null>
  vaultId: string
}

/**
 * Barra de formatação sempre visível para o modo WYSIWYG.
 * Usa onMouseDown+preventDefault para preservar a seleção do ProseMirror
 * (o clique no botão não rouba o foco do editor).
 */
export default function FormatToolbar({ apiRef, vaultId }: Props): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const colorWrapRef = useRef<HTMLDivElement>(null)
  const [colorOpen, setColorOpen] = useState(false)

  const run = (key: unknown, payload?: unknown): void => {
    apiRef.current?.run(key, payload)
    apiRef.current?.focus()
  }

  const applyColor = (color?: string): void => {
    run(applyColorCommand.key, color)
    setColorOpen(false)
  }

  // fecha o popover de cor ao clicar fora
  useEffect(() => {
    if (!colorOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!colorWrapRef.current?.contains(e.target as Node)) setColorOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [colorOpen])

  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const buf = new Uint8Array(await file.arrayBuffer())
    const rel = (await window.api.saveAsset(vaultId, file.name, buf)) as string
    run(insertImageCommand.key, { src: `md4all-asset://${vaultId}/${encodeURI(rel)}`, alt: file.name })
  }

  // botão: previne mousedown (mantém foco/seleção) e dispara no click
  const btn = (
    label: React.ReactNode,
    title: string,
    onClick: () => void
  ): JSX.Element => (
    <button
      className="fmt-btn"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className="format-toolbar">
      <div className="fmt-group">
        {btn('H1', 'Título 1', () => run(wrapInHeadingCommand.key, 1))}
        {btn('H2', 'Título 2', () => run(wrapInHeadingCommand.key, 2))}
        {btn('H3', 'Título 3', () => run(wrapInHeadingCommand.key, 3))}
        {btn('¶', 'Texto normal', () => run(turnIntoTextCommand.key))}
      </div>
      <span className="fmt-sep" />
      <div className="fmt-group">
        {btn(<b>B</b>, 'Negrito (Ctrl/Cmd+B)', () => run(toggleStrongCommand.key))}
        {btn(<i>I</i>, 'Itálico (Ctrl/Cmd+I)', () => run(toggleEmphasisCommand.key))}
        {btn(<s>S</s>, 'Tachado', () => run(toggleStrikethroughCommand.key))}
        {btn(<code>{'</>'}</code>, 'Código inline', () => run(toggleInlineCodeCommand.key))}
        {btn('🔗', 'Link', () => run(toggleLinkCommand.key, { href: '' }))}
        <div className="color-wrap" ref={colorWrapRef}>
          <button
            className="fmt-btn"
            title="Cor do texto"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setColorOpen((v) => !v)}
          >
            <span className="color-icon">A</span>
          </button>
          {colorOpen ? (
            <div className="color-popover">
              <div className="color-swatches">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="color-swatch"
                    style={{ background: c }}
                    title={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyColor(c)}
                  />
                ))}
              </div>
              <div className="color-actions">
                <label className="color-custom" title="Cor personalizada">
                  <span>Outra…</span>
                  <input
                    type="color"
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => applyColor(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="color-clear"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyColor(undefined)}
                >
                  Remover
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <span className="fmt-sep" />
      <div className="fmt-group">
        {btn('• ', 'Lista', () => run(wrapInBulletListCommand.key))}
        {btn('1.', 'Lista numerada', () => run(wrapInOrderedListCommand.key))}
        {btn('❝', 'Citação', () => run(wrapInBlockquoteCommand.key))}
      </div>
      <span className="fmt-sep" />
      <div className="fmt-group">
        {btn('{ }', 'Bloco de código', () => run(createCodeBlockCommand.key))}
        {btn('▦', 'Tabela', () => run(insertTableCommand.key))}
        {btn('🖼', 'Imagem', () => fileInputRef.current?.click())}
        {btn('―', 'Linha horizontal', () => run(insertHrCommand.key))}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void onImagePicked(e)}
      />
    </div>
  )
}
