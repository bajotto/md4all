import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

/**
 * Preview ao vivo de blocos ```mermaid``` no editor WYSIWYG.
 *
 * Não substitui o bloco de código (que continua editável no CodeMirror do
 * Crepe): adiciona logo abaixo dele uma widget decoration que renderiza o
 * diagrama. O resultado é cache-ado por (tema + código), e a `key` estável da
 * decoration faz o ProseMirror reaproveitar o DOM entre edições (sem flicker).
 */

const mermaidKey = new PluginKey('md4all-mermaid')

// cache de SVG por chave "tema:codigo" — evita re-render desnecessário
const svgCache = new Map<string, string>()

let mermaidMod: typeof import('mermaid').default | null = null

function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

async function getMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidMod) {
    mermaidMod = (await import('mermaid')).default
  }
  return mermaidMod
}

async function renderInto(div: HTMLElement, code: string): Promise<void> {
  const themed = `${isDark() ? 'dark' : 'light'}:${code}`
  const cached = svgCache.get(themed)
  if (cached) {
    div.innerHTML = cached
    return
  }
  try {
    const mermaid = await getMermaid()
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark() ? 'dark' : 'default',
      securityLevel: 'strict'
    })
    const id = `mmd-${Math.floor(Math.random() * 1e9).toString(36)}`
    const { svg } = await mermaid.render(id, code)
    svgCache.set(themed, svg)
    div.innerHTML = svg
    div.classList.remove('mermaid-error')
  } catch (err) {
    div.classList.add('mermaid-error')
    div.textContent = err instanceof Error ? err.message : String(err)
  }
}

function makeContainer(code: string): HTMLElement {
  const div = document.createElement('div')
  div.className = 'mermaid-preview'
  div.contentEditable = 'false'
  if (code.trim()) void renderInto(div, code)
  return div
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    const lang = (node.attrs.language as string | undefined)?.toLowerCase()
    if (lang !== 'mermaid') return
    const code = node.textContent
    const end = pos + node.nodeSize
    decos.push(
      Decoration.widget(end, () => makeContainer(code), {
        // key estável: mesma combinação tema+código reaproveita o DOM
        key: `mermaid:${isDark() ? 'd' : 'l'}:${code}`,
        side: 1
      })
    )
  })
  return DecorationSet.create(doc, decos)
}

/** Plugin ProseMirror que mantém os previews de mermaid sincronizados. */
export function mermaidPlugin(): Plugin {
  return new Plugin({
    key: mermaidKey,
    state: {
      init: (_config, instance) => buildDecorations(instance.doc),
      apply(tr, old) {
        if (!tr.docChanged) return old
        return buildDecorations(tr.doc)
      }
    },
    props: {
      decorations(state) {
        return mermaidKey.getState(state) as DecorationSet
      }
    }
  })
}
