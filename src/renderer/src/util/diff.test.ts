import { describe, it, expect } from 'vitest'
import { diffLines, diffStat } from './diff'

describe('diffLines (LCS por linha)', () => {
  it('marca linhas iguais como eq', () => {
    const d = diffLines('a\nb\nc', 'a\nb\nc')
    expect(d.every((l) => l.op === 'eq')).toBe(true)
    expect(d.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('detecta inserção e remoção preservando contexto', () => {
    const d = diffLines('linha1\nvelha\nlinha3', 'linha1\nnova\nlinha3')
    expect(d).toContainEqual({ op: 'del', text: 'velha' })
    expect(d).toContainEqual({ op: 'add', text: 'nova' })
    expect(d.filter((l) => l.op === 'eq').map((l) => l.text)).toEqual(['linha1', 'linha3'])
  })

  it('trata arquivo novo (oldText vazio) como tudo adicionado', () => {
    const d = diffLines('', 'a\nb')
    expect(d).toEqual([
      { op: 'add', text: 'a' },
      { op: 'add', text: 'b' }
    ])
  })

  it('trata remoção total (newText vazio) como tudo removido', () => {
    const d = diffLines('a\nb', '')
    expect(d.every((l) => l.op === 'del')).toBe(true)
  })
})

describe('diffStat', () => {
  it('conta adições e remoções', () => {
    const s = diffStat(diffLines('a\nb\nc', 'a\nx\nc\nd'))
    expect(s).toEqual({ added: 2, removed: 1 })
  })
})
