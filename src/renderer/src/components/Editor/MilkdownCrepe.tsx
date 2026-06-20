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

/** API imperativa exposta pelo editor para a toolbar de formatação e busca. */
export interface EditorApi {
  // dispara um comando Milkdown (ex.: toggleStrongCommand.key) com payload opcional
  run: (key: unknown, payload?: unknown) => void
  focus: () => void
  // rola até o n-ésimo heading (0-based) do documento — usado pelo sumário
  scrollToHeading: (index: number) => void
  search: SearchController
}

interface Props {
  vaultId: string
  // conteúdo inicial em forma de armazenamento (caminhos de imagem relativos)
  initialContent: string
  onChange: (storageMarkdown: string) => void
  apiRef?: MutableRefObject<EditorApi | null>
  // clique em [[wikilink]] e #tag (PKM)
  onWikilink?: (target: string) => void
  onTag?: (tag: string) => void
}

/**
 * Editor WYSIWYG inline (estilo Typora) baseado em Milkdown Crepe.
 * Traz tabelas GFM editáveis, blocos de código com CodeMirror, listas de
 * tarefas, drag handles e upload de imagens. Recriado a cada arquivo via `key`.
 */
export default function MilkdownCrepe({
  vaultId,
  initialContent,
  onChange,
  apiRef,
  onWikilink,
  onTag
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onWikilinkRef = useRef(onWikilink)
  onWikilinkRef.current = onWikilink
  const onTagRef = useRef(onTag)
  onTagRef.current = onTag

  const handleHostClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = (e.target as HTMLElement).closest('[data-target],[data-tag]') as HTMLElement | null
    if (!el) return
    const target = el.getAttribute('data-target')
    const tag = el.getAttribute('data-tag')
    if (target != null) {
      e.preventDefault()
      onWikilinkRef.current?.(target)
    } else if (tag != null) {
      e.preventDefault()
      onTagRef.current?.(tag)
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let destroyed = false
    // Só passamos a propagar mudanças DEPOIS que o editor terminou de carregar.
    // O Crepe dispara markdownUpdated durante a montagem (parse->serialize do
    // conteúdo inicial), o que reescreveria o arquivo de forma normalizada
    // (escapando `\`, virando `---`->`***`, inserindo `<br/>`) só por abri-lo.
    // Ignorando essa emissão inicial, o autosave nunca corrompe um arquivo
    // que o usuário apenas visualizou.
    let loaded = false
    const crepe = new Crepe({
      root: host,
      defaultValue: toDisplay(initialContent, vaultId),
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          // colar/arrastar/upload de imagem -> salva em <vault>/assets/
          onUpload: async (file: File): Promise<string> => {
            const buf = new Uint8Array(await file.arrayBuffer())
            const rel = (await window.api.saveAsset(vaultId, file.name, buf)) as string
            return `md4all-asset://${vaultId}/${encodeURI(rel)}`
          }
        }
      }
    })

    // registra a mark de cor + round-trip remark antes de criar o editor
    crepe.editor.use(colorPlugins)

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (destroyed || !loaded) return
        onChangeRef.current(toStorage(markdown, vaultId))
      })
    })

    void crepe.create().then(() => {
      if (destroyed) return
      // A emissão inicial do parse acontece de forma síncrona durante create();
      // ao chegar aqui ela já passou (e foi ignorada). Liberamos no próximo
      // tick por segurança, usando setTimeout (dispara mesmo em segundo plano).
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
      // injeta o plugin de busca na view já criada (reconfigure)
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
    // initialContent intencionalmente fora das deps: o remount é controlado
    // pela `key` no componente pai (troca de arquivo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId])

  return <div className="crepe-host" ref={hostRef} onClick={handleHostClick} />
}
