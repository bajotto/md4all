import { describe, it, expect } from 'vitest'
import { diffLines, diffStat } from './diff'

describe('diffLines (line-based LCS)', () => {
  it('marks equal lines as eq', () => {
    const d = diffLines('a\nb\nc', 'a\nb\nc')
    expect(d.every((l) => l.op === 'eq')).toBe(true)
    expect(d.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('detects insertion and removal preserving context', () => {
    const d = diffLines('line1\nold\nline3', 'line1\nnew\nline3')
    expect(d).toContainEqual({ op: 'del', text: 'old' })
    expect(d).toContainEqual({ op: 'add', text: 'new' })
    expect(d.filter((l) => l.op === 'eq').map((l) => l.text)).toEqual(['line1', 'line3'])
  })

  it('treats new file (empty oldText) as all added', () => {
    const d = diffLines('', 'a\nb')
    expect(d).toEqual([
      { op: 'add', text: 'a' },
      { op: 'add', text: 'b' }
    ])
  })

  it('treats full removal (empty newText) as all removed', () => {
    const d = diffLines('a\nb', '')
    expect(d.every((l) => l.op === 'del')).toBe(true)
  })
})

describe('diffStat', () => {
  it('counts additions and removals', () => {
    const s = diffStat(diffLines('a\nb\nc', 'a\nx\nc\nd'))
    expect(s).toEqual({ added: 2, removed: 1 })
  })
})
