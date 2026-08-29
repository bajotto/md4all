import { useEffect, useRef, type MutableRefObject } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { toDisplay, toStorage } from './assetPaths'
import { createPmController, searchPlugin } from '../../editor/pmSearch'
import { mermaidPlugin } from '../../editor/mermaidPlugin'
import { pkmTokensPlugin } from '../../editor/pkmTokens'
import { colorPlugins } from '../../editor/colorMark'
import type { SearchController } from '../../editor/search'

// common markdown link ([text](path.md)) pointing to another file in the
// vault: no scheme (http:, mailto:, md4all-asset:...) and ending in .md
const LINK_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
const MD_LINK_RE = /\.(md|markdown|mdown|mkd)(#.*)?$/i

function isInternalMdLink(href: string): boolean {
  if (!href || LINK_SCHEME_RE.test(href) || href.startsWith('//')) return false
  return MD_LINK_RE.test(href)
}

/** Imperative API exposed by the editor for the formatting toolbar and search. */
export interface EditorApi {
  // triggers a Milkdown command (e.g. toggleStrongCommand.key) with optional payload
  run: (key: unknown, payload?: unknown) => void
  focus: () => void
  // scrolls to the nth heading (0-based) in the document — used by the outline
  scrollToHeading: (index: number) => void
  search: SearchController
}

interface Props {
  vaultId: string
  // initial content in storage form (relative image paths)
  initialContent: string
  onChange: (storageMarkdown: string) => void
  apiRef?: MutableRefObject<EditorApi | null>
  // click on [[wikilink]] and #tag (PKM)
  onWikilink?: (target: string) => void
  onTag?: (tag: string) => void
  // click on common markdown link pointing to another note in the vault
  onLinkClick?: (href: string) => void
}

/**
 * Inline WYSIWYG editor (Typora-style) based on Milkdown Crepe.
 * Brings editable GFM tables, code blocks with CodeMirror, task lists,
 * drag handles and image uploads. Recreated per file via `key`.
 */
export default function MilkdownCrepe({
  vaultId,
  initialContent,
  onChange,
  apiRef,
  onWikilink,
  onTag,
  onLinkClick
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onWikilinkRef = useRef(onWikilink)
  onWikilinkRef.current = onWikilink
  const onTagRef = useRef(onTag)
  onTagRef.current = onTag
  const onLinkClickRef = useRef(onLinkClick)
  onLinkClickRef.current = onLinkClick

  const handleHostClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = (e.target as HTMLElement).closest('[data-target],[data-tag]') as HTMLElement | null
    if (el) {
      const target = el.getAttribute('data-target')
      const tag = el.getAttribute('data-tag')
      if (target != null) {
        e.preventDefault()
        onWikilinkRef.current?.(target)
      } else if (tag != null) {
        e.preventDefault()
        onTagRef.current?.(tag)
      }
      return
    }
    const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    if (isInternalMdLink(href)) {
      e.preventDefault()
      onLinkClickRef.current?.(href)
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let destroyed = false
    // We only start propagating changes AFTER the editor has finished loading.
    // Crepe fires markdownUpdated during mount (parse->serialize of the
    // initial content), which would rewrite the file in a normalized form
    // (escaping `\`, turning `---`->`***`, inserting `<br/>`) just by opening it.
    // By ignoring this initial emission, autosave never corrupts a file
    // that the user merely viewed.
    let loaded = false
    const crepe = new Crepe({
      root: host,
      defaultValue: toDisplay(initialContent, vaultId),
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          // paste/drag/upload image -> saves to <vault>/assets/
          onUpload: async (file: File): Promise<string> => {
            const buf = new Uint8Array(await file.arrayBuffer())
            const rel = (await window.api.saveAsset(vaultId, file.name, buf)) as string
            return `md4all-asset://${vaultId}/${encodeURI(rel)}`
          }
        }
      }
    })

    // registers the color mark + remark round-trip before creating the editor
    crepe.editor.use(colorPlugins)

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (destroyed || !loaded) return
        onChangeRef.current(toStorage(markdown, vaultId))
      })
    })

    void crepe.create().then(() => {
      if (destroyed) return
      // The initial parse emission happens synchronously during create();
      // by the time we get here it has already passed (and was ignored). We
      // release on the next tick for safety, using setTimeout (fires even in background).
      setTimeout(() => {
        loaded = true
      }, 0)
      if (!apiRef) return
      const editor = crepe.editor
      const getView = (): EditorView | null => {
        try {
          return editor.action((ctx) => ctx.get(editorViewCtx))
        } catch {
          return null
        }
      }
      // injects the search plugin into the already created view (reconfigure)
      const view = getView()
      if (view) {
        view.updateState(
          view.state.reconfigure({
            plugins: view.state.plugins.concat(searchPlugin(), mermaidPlugin(), pkmTokensPlugin())
          })
        )
      }
      apiRef.current = {
        run: (key, payload) => {
          editor.action(callCommand(key as never, payload as never))
        },
        focus: () => {
          editor.action((ctx) => ctx.get(editorViewCtx).focus())
        },
        scrollToHeading: (index) => {
          const v = getView()
          if (!v) return
          let count = 0
          let target = -1
          v.state.doc.descendants((node, pos) => {
            if (target >= 0) return false
            if (node.type.name === 'heading') {
              if (count === index) {
                target = pos
                return false
              }
              count++
            }
            return true
          })
          if (target < 0) return
          const sel = TextSelection.near(v.state.doc.resolve(target + 1))
          v.dispatch(v.state.tr.setSelection(sel).scrollIntoView())
          v.focus()
        },
        search: createPmController(getView)
      }
    })

    return () => {
      destroyed = true
      if (apiRef) apiRef.current = null
      void crepe.destroy()
    }
    // initialContent intentionally excluded from deps: remount is controlled
    // by the `key` in the parent component (file switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId])

  return <div className="crepe-host" ref={hostRef} onClick={handleHostClick} />
}
