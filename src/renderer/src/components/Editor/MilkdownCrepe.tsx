import { useEffect, useRef, type MutableRefObject } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { toDisplay, toStorage } from './assetPaths'

/** API imperativa exposta pelo editor para a toolbar de formatação. */
export interface EditorApi {
  // dispara um comando Milkdown (ex.: toggleStrongCommand.key) com payload opcional
  run: (key: unknown, payload?: unknown) => void
  focus: () => void
}

interface Props {
  vaultId: string
  // conteúdo inicial em forma de armazenamento (caminhos de imagem relativos)
  initialContent: string
  onChange: (storageMarkdown: string) => void
  apiRef?: MutableRefObject<EditorApi | null>
}

/**
 * Editor WYSIWYG inline (estilo Typora) baseado em Milkdown Crepe.
 * Traz tabelas GFM editáveis, blocos de código com CodeMirror, listas de
 * tarefas, drag handles e upload de imagens. Recriado a cada arquivo via `key`.
 */
export default function MilkdownCrepe({ vaultId, initialContent, onChange, apiRef }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

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
      apiRef.current = {
        run: (key, payload) => {
          editor.action(callCommand(key as never, payload as never))
        },
        focus: () => {
          editor.action((ctx) => ctx.get(editorViewCtx).focus())
        }
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

  return <div className="crepe-host" ref={hostRef} />
}
