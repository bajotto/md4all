import { describe, it, expect } from 'vitest'
import { extractRefs, normRef } from './doccheckCore'

describe('extractRefs', () => {
  it('pega âncoras [src: …] e links markdown com extensão', () => {
    const md = 'Ver [auth](src/auth.ts) e [src: src/server.ts:PORT].'
    const refs = extractRefs(md)
    expect(refs).toContain('src/auth.ts')
    expect(refs).toContain('src/server.ts:PORT')
  })

  it('ignora URLs, âncoras internas e texto sem extensão', () => {
    const md = '[site](https://x.com) [topo](#intro) [texto](algo) [npm](npm run x)'
    expect(extractRefs(md)).toEqual([])
  })

  it('não confunde texto comum com referência', () => {
    expect(extractRefs('Rode `npm test` e veja o resultado.')).toEqual([])
  })
})

describe('normRef', () => {
  it('separa caminho de símbolo', () => {
    expect(normRef('src/auth.ts:login')).toEqual({ file: 'src/auth.ts', symbol: 'login' })
  })
  it('trata :linha numérica como linha, não símbolo', () => {
    expect(normRef('src/auth.ts:42')).toEqual({ file: 'src/auth.ts' })
    expect(normRef('src/auth.ts:L42')).toEqual({ file: 'src/auth.ts' })
  })
  it('remove ./ e fragmento #', () => {
    expect(normRef('./docs/x.md#sec')).toEqual({ file: 'docs/x.md' })
  })
})
