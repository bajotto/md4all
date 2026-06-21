import { CODE_EXTS, collectPaths, readFile } from './vault'
import { extractExports, renderFactsBlock, type RepoFacts } from './repoFactsCore'

export { renderFactsBlock, type RepoFacts }

export async function collectRepoFacts(vaultId: string): Promise<RepoFacts> {
  const facts: RepoFacts = {
    scripts: {},
    entryPoints: [],
    topDirs: [],
    exports: [],
    count: 0
  }

  // package.json (fatos de build/test/run + entry)
  try {
    const pkgRaw = await readFile(vaultId, 'package.json')
    const pkg = JSON.parse(pkgRaw) as {
      name?: string
      description?: string
      main?: string
      bin?: unknown
      scripts?: Record<string, string>
    }
    facts.name = pkg.name
    facts.description = pkg.description
    facts.scripts = pkg.scripts ?? {}
    if (pkg.main) facts.entryPoints.push(pkg.main)
    if (typeof pkg.bin === 'string') facts.entryPoints.push(pkg.bin)
    else if (pkg.bin && typeof pkg.bin === 'object')
      facts.entryPoints.push(...Object.values(pkg.bin as Record<string, string>))
  } catch {
    /* sem package.json: tudo bem */
  }

  // diretórios de topo (a partir dos caminhos de código)
  const codePaths = await collectPaths(vaultId, CODE_EXTS)
  const dirs = new Set<string>()
  for (const p of codePaths) {
    const top = p.split('/')[0]
    if (top && top.includes('.') === false) dirs.add(top)
  }
  facts.topDirs = [...dirs].sort()

  // exports públicos (heurístico, agnóstico) — limita p/ não estourar
  const MAX_FILES = 200
  const MAX_EXPORTS = 400
  for (const p of codePaths.slice(0, MAX_FILES)) {
    if (facts.exports.length >= MAX_EXPORTS) break
    try {
      const content = await readFile(vaultId, p)
      for (const sym of extractExports(content)) {
        if (facts.exports.length >= MAX_EXPORTS) break
        facts.exports.push({ path: p, symbol: sym })
      }
    } catch {
      /* ignora */
    }
  }

  facts.count =
    Object.keys(facts.scripts).length +
    facts.entryPoints.length +
    facts.topDirs.length +
    facts.exports.length
  return facts
}
