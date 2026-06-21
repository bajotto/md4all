import { describe, it, expect } from 'vitest'
import { extractExports, renderFactsBlock } from './repoFactsCore'

describe('extractExports — agnóstico de linguagem', () => {
  it('pega export function/const/class (TS/JS)', () => {
    const code = `export function login(){}\nexport const PORT = 8080\nexport class Auth {}\nexport default function main(){}`
    const syms = extractExports(code)
    expect(syms).toContain('login')
    expect(syms).toContain('PORT')
    expect(syms).toContain('Auth')
    expect(syms).toContain('main')
  })

  it('pega named exports com alias (export { a, b as c })', () => {
    const syms = extractExports('const a=1,b=2; export { a, b as publicB }')
    expect(syms).toContain('a')
    expect(syms).toContain('publicB')
    expect(syms).not.toContain('b') // veio com alias
  })

  it('pega def/class de Python e func de Go', () => {
    expect(extractExports('def handler(req):\n    pass')).toContain('handler')
    expect(extractExports('class Service:\n    pass')).toContain('Service')
    expect(extractExports('func Serve() {}')).toContain('Serve')
  })

  it('não inventa símbolos quando não há exports', () => {
    expect(extractExports('const x = 1\nconsole.log(x)')).toEqual([])
  })
})

describe('renderFactsBlock — bloco determinístico do AGENTS.md', () => {
  it('inclui nome, scripts, entry points e símbolos', () => {
    const md = renderFactsBlock({
      name: 'fixture-app',
      description: 'App de teste',
      scripts: { start: 'node src/server.ts', test: 'vitest' },
      entryPoints: ['src/server.ts'],
      topDirs: ['src'],
      exports: [{ path: 'src/auth.ts', symbol: 'login' }],
      count: 4
    })
    expect(md).toContain('# fixture-app')
    expect(md).toContain('`npm run start` — `node src/server.ts`')
    expect(md).toContain('`npm run test` — `vitest`')
    expect(md).toContain('- `src/server.ts`')
    expect(md).toContain('`src/auth.ts`: login')
    expect(md).toContain('determinístico')
  })

  it('omite seções vazias', () => {
    const md = renderFactsBlock({ scripts: {}, entryPoints: [], topDirs: [], exports: [], count: 0 })
    expect(md).not.toContain('## Comandos')
    expect(md).not.toContain('## Entry points')
  })
})
