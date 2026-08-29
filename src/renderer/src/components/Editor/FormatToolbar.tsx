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

// default palette for the color picker (works in both light and dark themes)
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
 * Always-visible formatting toolbar for WYSIWYG mode.
 * Uses onMouseDown+preventDefault to preserve the ProseMirror selection
 * (clicking the button doesn't steal focus from the editor).
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

  // closes the color popover when clicking outside
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

  // button: prevents mousedown (keeps focus/selection) and triggers on click
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
        {btn('H1', 'Heading 1', () => run(wrapInHeadingCommand.key, 1))}
        {btn('H2', 'Heading 2', () => run(wrapInHeadingCommand.key, 2))}
        {btn('H3', 'Heading 3', () => run(wrapInHeadingCommand.key, 3))}
        {btn('¶', 'Normal text', () => run(turnIntoTextCommand.key))}
      </div>
      <span className="fmt-sep" />
      <div className="fmt-group">
        {btn(<b>B</b>, 'Bold (Ctrl/Cmd+B)', () => run(toggleStrongCommand.key))}
        {btn(<i>I</i>, 'Italic (Ctrl/Cmd+I)', () => run(toggleEmphasisCommand.key))}
        {btn(<s>S</s>, 'Strikethrough', () => run(toggleStrikethroughCommand.key))}
        {btn(<code>{'</>'}</code>, 'Inline code', () => run(toggleInlineCodeCommand.key))}
        {btn('🔗', 'Link', () => run(toggleLinkCommand.key, { href: '' }))}
        <div className="color-wrap" ref={colorWrapRef}>
          <button
            className="fmt-btn"
            title="Text color"
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
                <label className="color-custom" title="Custom color">
                  <span>Other…</span>
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
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <span className="fmt-sep" />
      <div className="fmt-group">
        {btn('• ', 'List', () => run(wrapInBulletListCommand.key))}
        {btn('1.', 'Numbered list', () => run(wrapInOrderedListCommand.key))}
        {btn('❝', 'Quote', () => run(wrapInBlockquoteCommand.key))}
      </div>
      <span className="fmt-sep" />
      <div className="fmt-group">
        {btn('{ }', 'Code block', () => run(createCodeBlockCommand.key))}
        {btn('▦', 'Table', () => run(insertTableCommand.key))}
        {btn('🖼', 'Image', () => fileInputRef.current?.click())}
        {btn('―', 'Horizontal line', () => run(insertHrCommand.key))}
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
