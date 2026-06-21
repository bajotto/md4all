import { describe, it, expect } from 'vitest'
import { anchorMatches, normalize } from './groundingCore'

const serverCode = 'const PORT = 8080\napp.listen(PORT)\n'
const authCode = 'export function login(user, pass){\n  return signJwt(user, "1h")\n}\n'

describe('normalize', () => {
  it('colapsa whitespace e baixa caixa', () => {
    expect(normalize('  Const   PORT\n=\t8080 ')).toBe('const port = 8080')
  })
})

describe('anchorMatches — núcleo de grounding (verified vs unverified)', () => {
  it('aceita quote literal presente no código', () => {
    expect(anchorMatches(serverCode, { quote: 'const PORT = 8080' })).toBe(true)
  })

  it('aceita apesar de diferença de whitespace', () => {
    expect(anchorMatches(serverCode, { quote: 'const   PORT =\n8080' })).toBe(true)
  })

  it('REJEITA quote alucinada (número errado)', () => {
    expect(anchorMatches(serverCode, { quote: 'const PORT = 9090' })).toBe(false)
  })

  it('REJEITA afirmação inexistente no código', () => {
    expect(anchorMatches(serverCode, { quote: 'OAuth2 com Google' })).toBe(false)
  })

  it('aceita quote com aspas internas (JWT 1h)', () => {
    expect(anchorMatches(authCode, { quote: 'signJwt(user, "1h")' })).toBe(true)
  })

  it('rejeita quote muito curta (< 4 chars) p/ evitar falso positivo', () => {
    expect(anchorMatches(serverCode, { quote: 'PT' })).toBe(false)
  })

  it('verifica por symbol quando presente', () => {
    expect(anchorMatches(authCode, { symbol: 'login' })).toBe(true)
    expect(anchorMatches(authCode, { symbol: 'logout' })).toBe(false)
  })

  it('âncora vazia não bate', () => {
    expect(anchorMatches(serverCode, {})).toBe(false)
  })
})
