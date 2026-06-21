import { describe, it, expect } from 'vitest'
import { setChildrenAt } from './treeUtil'
import type { FileNode } from '../types'

const tree: FileNode[] = [
  { name: 'a.md', path: 'a.md', isDir: false },
  { name: 'docs', path: 'docs', isDir: true }, // children undefined = não carregado
  {
    name: 'src',
    path: 'src',
    isDir: true,
    children: [{ name: 'main', path: 'src/main', isDir: true }]
  }
]

describe('setChildrenAt (merge da árvore lazy)', () => {
  it('preenche os filhos de um diretório de topo ainda não carregado', () => {
    const kids: FileNode[] = [{ name: 'x.md', path: 'docs/x.md', isDir: false }]
    const out = setChildrenAt(tree, 'docs', kids)
    expect(out.find((n) => n.path === 'docs')?.children).toEqual(kids)
    // não toca os outros nós
    expect(out.find((n) => n.path === 'a.md')).toBe(tree[0])
  })

  it('preenche um diretório aninhado descendo pelo prefixo', () => {
    const kids: FileNode[] = [{ name: 'index.ts', path: 'src/main/index.ts', isDir: false }]
    const out = setChildrenAt(tree, 'src/main', kids)
    const srcMain = out.find((n) => n.path === 'src')?.children?.find((c) => c.path === 'src/main')
    expect(srcMain?.children).toEqual(kids)
  })

  it('é imutável (não muta a árvore original)', () => {
    setChildrenAt(tree, 'docs', [{ name: 'y.md', path: 'docs/y.md', isDir: false }])
    expect(tree.find((n) => n.path === 'docs')?.children).toBeUndefined()
  })

  it('aceita pasta vazia (children: []) sem quebrar', () => {
    const out = setChildrenAt(tree, 'docs', [])
    expect(out.find((n) => n.path === 'docs')?.children).toEqual([])
  })
})
