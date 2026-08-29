import { describe, it, expect } from 'vitest'
import { anchorMatches, normalize } from './groundingCore'

const serverCode = 'const PORT = 8080\napp.listen(PORT)\n'
const authCode = 'export function login(user, pass){\n  return signJwt(user, "1h")\n}\n'

describe('normalize', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalize('  Const   PORT\n=\t8080 ')).toBe('const port = 8080')
  })
})

describe('anchorMatches — grounding core (verified vs unverified)', () => {
  it('accepts literal quote present in the code', () => {
    expect(anchorMatches(serverCode, { quote: 'const PORT = 8080' })).toBe(true)
  })

  it('accepts despite whitespace difference', () => {
    expect(anchorMatches(serverCode, { quote: 'const   PORT =\n8080' })).toBe(true)
  })

  it('REJECTS hallucinated quote (wrong number)', () => {
    expect(anchorMatches(serverCode, { quote: 'const PORT = 9090' })).toBe(false)
  })

  it('REJECTS claim nonexistent in the code', () => {
    expect(anchorMatches(serverCode, { quote: 'OAuth2 with Google' })).toBe(false)
  })

  it('accepts quote with internal quotes (JWT 1h)', () => {
    expect(anchorMatches(authCode, { quote: 'signJwt(user, "1h")' })).toBe(true)
  })

  it('rejects very short quote (< 4 chars) to avoid false positive', () => {
    expect(anchorMatches(serverCode, { quote: 'PT' })).toBe(false)
  })

  it('verifies by symbol when present', () => {
    expect(anchorMatches(authCode, { symbol: 'login' })).toBe(true)
    expect(anchorMatches(authCode, { symbol: 'logout' })).toBe(false)
  })

  it('empty anchor does not match', () => {
    expect(anchorMatches(serverCode, {})).toBe(false)
  })
})
