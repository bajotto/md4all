import { describe, it, expect } from 'vitest'
import { setChildrenAt, setHasMdAt } from './treeUtil'
import type { FileNode } from '../types'

const tree: FileNode[] = [
  { name: 'a.md', path: 'a.md', isDir: false },
  { name: 'docs', path: 'docs', isDir: true }, // children undefined = not loaded
  {
    name: 'src',
    path: 'src',
    isDir: true,
    children: [{ name: 'main', path: 'src/main', isDir: true }]
  }
]

describe('setChildrenAt (lazy tree merge)', () => {
  it('fills children of a top-level directory not yet loaded', () => {
    const kids: FileNode[] = [{ name: 'x.md', path: 'docs/x.md', isDir: false }]
    const out = setChildrenAt(tree, 'docs', kids)
    expect(out.find((n) => n.path === 'docs')?.children).toEqual(kids)
    // does not touch other nodes
    expect(out.find((n) => n.path === 'a.md')).toBe(tree[0])
  })

  it('fills a nested directory by descending via prefix', () => {
    const kids: FileNode[] = [{ name: 'index.ts', path: 'src/main/index.ts', isDir: false }]
    const out = setChildrenAt(tree, 'src/main', kids)
    const srcMain = out.find((n) => n.path === 'src')?.children?.find((c) => c.path === 'src/main')
    expect(srcMain?.children).toEqual(kids)
  })

  it('is immutable (does not mutate the original tree)', () => {
    setChildrenAt(tree, 'docs', [{ name: 'y.md', path: 'docs/y.md', isDir: false }])
    expect(tree.find((n) => n.path === 'docs')?.children).toBeUndefined()
  })

  it('accepts empty folder (children: []) without breaking', () => {
    const out = setChildrenAt(tree, 'docs', [])
    expect(out.find((n) => n.path === 'docs')?.children).toEqual([])
  })
})

describe('setHasMdAt (markdown folder highlight)', () => {
  it('marks hasMd on a top-level directory', () => {
    const out = setHasMdAt(tree, 'docs', true)
    expect(out.find((n) => n.path === 'docs')?.hasMd).toBe(true)
  })

  it('marks hasMd on a nested directory', () => {
    const out = setHasMdAt(tree, 'src/main', true)
    const sm = out.find((n) => n.path === 'src')?.children?.find((c) => c.path === 'src/main')
    expect(sm?.hasMd).toBe(true)
  })

  it('does not mutate the original tree', () => {
    setHasMdAt(tree, 'docs', true)
    expect(tree.find((n) => n.path === 'docs')?.hasMd).toBeUndefined()
  })
})
