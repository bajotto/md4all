import { $command, $markSchema, $remark } from '@milkdown/kit/utils'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'

/**
 * Cor de texto inline para o editor WYSIWYG (Milkdown/ProseMirror).
 *
 * Representação canônica no markdown: `<span style="color:VALOR">texto</span>`
 * — HTML inline puro, que o markdown-it do export já renderiza sem plugin
 * extra. O round-trip (markdown <-> documento) é feito por um plugin remark:
 *  - na leitura, funde a sequência de nós html `<span style="color">…</span>`
 *    num nó mdast `color`, que a mark abaixo converte para uma mark do PM;
 *  - na escrita, um handler do remark-stringify reescreve o nó `color` de
 *    volta para o `<span>`.
 */

const COLOR_RE = /color\s*:\s*([^;"')]+)/i

function isSpanOpen(v: string): boolean {
  return /^<span(\s|>)/i.test(v.trim())
}
function isSpanClose(v: string): boolean {
  return /^<\/span\s*>/i.test(v.trim())
}
function colorOf(v: string): string | null {
  const m = COLOR_RE.exec(v)
  return m ? m[1].trim() : null
}

interface MdastNode {
  type: string
  value?: string
  color?: string
  children?: MdastNode[]
}

/** Funde sequências `<span style="color">…</span>` (no nível atual) em nós `color`. */
function mergeColorSpans(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = []
  let i = 0
  while (i < children.length) {
    const n = children[i]
    if (n.type === 'html' && n.value && isSpanOpen(n.value)) {
      const color = colorOf(n.value)
      // procura o </span> correspondente respeitando aninhamento de spans
      let depth = 1
      let j = i + 1
      while (j < children.length) {
        const m = children[j]
        if (m.type === 'html' && m.value && isSpanOpen(m.value)) depth++
        else if (m.type === 'html' && m.value && isSpanClose(m.value)) {
          depth--
          if (depth === 0) break
        }
        j++
      }
      if (color && j < children.length && depth === 0) {
        const inner = children.slice(i + 1, j)
        out.push({ type: 'color', color, children: mergeColorSpans(inner) })
        i = j + 1
        continue
      }
    }
    out.push(n)
    i++
  }
  return out
}

function transform(node: MdastNode): void {
  if (!node || !Array.isArray(node.children)) return
  node.children.forEach(transform)
  node.children = mergeColorSpans(node.children)
}

/** Plugin remark que cuida do round-trip de cor (parse + stringify). */
export const remarkColor = $remark('md4allColor', () => {
  return function attacher(this: {
    data: () => { toMarkdownExtensions?: unknown[] }
  }) {
    const data = this.data()
    const list = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])
    list.push({
      handlers: {
        color(
          node: MdastNode,
          _parent: unknown,
          state: {
            containerPhrasing: (n: MdastNode, info: Record<string, unknown>) => string
          },
          info: Record<string, unknown>
        ): string {
          const open = `<span style="color:${node.color ?? ''}">`
          const content = state.containerPhrasing(node, { ...info, before: '>', after: '<' })
          return `${open}${content}</span>`
        }
      }
    })
    return (tree: MdastNode) => transform(tree)
  }
})

/** Schema da mark de cor (render no WYSIWYG + parse de HTML colado). */
export const colorSchema = $markSchema('color', () => ({
  attrs: {
    color: { default: '', validate: 'string' }
  },
  parseDOM: [
    {
      tag: 'span[style]',
      getAttrs: (dom): { color: string } | false => {
        if (!(dom instanceof HTMLElement)) return false
        const color = colorOf(dom.getAttribute('style') ?? '')
        return color ? { color } : false
      }
    },
    {
      tag: 'span[data-color]',
      getAttrs: (dom): { color: string } | false => {
        if (!(dom instanceof HTMLElement)) return false
        const color = dom.getAttribute('data-color')
        return color ? { color } : false
      }
    },
    {
      tag: 'font[color]',
      getAttrs: (dom): { color: string } | false => {
        if (!(dom instanceof HTMLElement)) return false
        const color = dom.getAttribute('color')
        return color ? { color } : false
      }
    }
  ],
  toDOM: (mark) => [
    'span',
    { 'data-color': mark.attrs.color, style: `color:${mark.attrs.color}` },
    0
  ],
  parseMarkdown: {
    match: (node) => node.type === 'color',
    runner: (state, node, markType) => {
      state.openMark(markType, { color: node.color as string })
      state.next(node.children)
      state.closeMark(markType)
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'color',
    runner: (state, mark) => {
      state.withMark(mark, 'color', undefined, { color: mark.attrs.color })
    }
  }
}))

/**
 * Aplica (color definido) ou remove (color vazio) a cor na seleção.
 * Substitui qualquer cor anterior, já que só faz sentido uma por trecho.
 */
export const applyColorCommand = $command(
  'ApplyColor',
  (ctx) =>
    (color?: string) =>
    (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
      const { from, to, empty } = state.selection
      if (empty) return false
      const type = colorSchema.type(ctx)
      if (dispatch) {
        const tr = state.tr.removeMark(from, to, type)
        if (color) tr.addMark(from, to, type.create({ color }))
        dispatch(tr.scrollIntoView())
      }
      return true
    }
)

/** Conjunto de plugins a registrar no editor Milkdown para habilitar cores. */
export const colorPlugins: MilkdownPlugin[] = [
  remarkColor,
  colorSchema,
  applyColorCommand
].flat() as MilkdownPlugin[]
