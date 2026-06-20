import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { toDisplay, toStorage } from './assetPaths'

interface Props {
  vaultId: string
  // conteúdo inicial em forma de armazenamento (caminhos de imagem relativos)
  initialContent: string
  onChange: (storageMarkdown: string) => void
}

/**
 * Editor WYSIWYG inline (estilo Typora) baseado em Milkdown Crepe.
 * Traz tabelas GFM editáveis, blocos de código com CodeMirror, listas de
 * tarefas, drag handles e upload de imagens. Recriado a cada arquivo via `key`.
 */
export default function MilkdownCrepe({ vaultId, initialContent, onChange }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let destroyed = false
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
        if (destroyed) return
        onChangeRef.current(toStorage(markdown, vaultId))
      })
    })

    void crepe.create()

    return () => {
      destroyed = true
      void crepe.destroy()
    }
    // initialContent intencionalmente fora das deps: o remount é controlado
    // pela `key` no componente pai (troca de arquivo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId])

  return <div className="crepe-host" ref={hostRef} />
}
