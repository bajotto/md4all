import { describe, it, expect } from 'vitest'
import { extractRefs, normRef } from './doccheckCore'

describe('extractRefs', () => {
  it('captures [src: …] anchors and markdown links with extension', () => {
    const md = 'See [auth](src/auth.ts) and [src: src/server.ts:PORT].'
    const refs = extractRefs(md)
    expect(refs).toContain('src/auth.ts')
    expect(refs).toContain('src/server.ts:PORT')
  })

  it('ignores URLs, internal anchors and text without extension', () => {
    const md = '[site](https://x.com) [top](#intro) [text](something) [npm](npm run x)'
    expect(extractRefs(md)).toEqual([])
  })

  it('does not confuse plain text with a reference', () => {
    expect(extractRefs('Run `npm test` and see the result.')).toEqual([])
  })
})

describe('normRef', () => {
  it('separates path from symbol', () => {
    expect(normRef('src/auth.ts:login')).toEqual({ file: 'src/auth.ts', symbol: 'login' })
  })
  it('treats numeric :line as line, not symbol', () => {
    expect(normRef('src/auth.ts:42')).toEqual({ file: 'src/auth.ts' })
    expect(normRef('src/auth.ts:L42')).toEqual({ file: 'src/auth.ts' })
  })
  it('removes ./ and # fragment', () => {
    expect(normRef('./docs/x.md#sec')).toEqual({ file: 'docs/x.md' })
  })
})
