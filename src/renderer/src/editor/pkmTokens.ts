import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

/**
 * Highlights (and makes clickable, via data-attrs + delegation in the host) PKM
 * tokens in the WYSIWYG: wikilinks `[[note]]` and tags `#tag`. These are only
 * decorations — the text in the markdown remains intact (no round-trip to maintain).
 */

const pkmKey = new PluginKey('md4all-pkm')

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g
const TAG_RE = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text

    WIKILINK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKILINK_RE.exec(text)) !== null) {
      const from = pos + m.index
      const to = from + m[0].length
      const target = m[1].split('|')[0].split('#')[0].trim()
      decos.push(Decoration.inline(from, to, { class: 'wikilink', 'data-target': target }))
    }

    TAG_RE.lastIndex = 0
    while ((m = TAG_RE.exec(text)) !== null) {
      const tag = m[1]
      const tokenStart = m.index + (m[0].length - (tag.length + 1)) // position of '#'
      const from = pos + tokenStart
      const to = from + tag.length + 1
      decos.push(Decoration.inline(from, to, { class: 'tag-token', 'data-tag': tag }))
    }
  })
  return DecorationSet.create(doc, decos)
}

export function pkmTokensPlugin(): Plugin {
  return new Plugin({
    key: pkmKey,
    state: {
      init: (_c, instance) => buildDecorations(instance.doc),
      apply(tr, old) {
        if (!tr.docChanged) return old
        return buildDecorations(tr.doc)
      }
    },
    props: {
      decorations(state) {
        return pkmKey.getState(state) as DecorationSet
      }
    }
  })
}
