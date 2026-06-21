// Lógica pura de extração/renderização de fatos do repositório (sem fs/Electron).

export interface RepoFacts {
  name?: string
  description?: string
  scripts: Record<string, string>
  entryPoints: string[]
  topDirs: string[]
  exports: { path: string; symbol: string }[]
  count: number
}

const EXPORT_RE = [
  /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
  /export\s+\{([^}]+)\}/g, // export { a, b as c }
  /^def\s+([A-Za-z_]\w*)/gm, // python
  /^class\s+([A-Za-z_]\w*)/gm,
  /func\s+([A-Za-z_]\w*)/g // go
]

/** Extrai nomes de símbolos exportados/definidos (heurístico, agnóstico). */
export function extractExports(content: string): string[] {
  const found = new Set<string>()
  for (const re of EXPORT_RE) {
    let m: RegExpExecArray | null
    const r = new RegExp(re.source, re.flags)
    while ((m = r.exec(content))) {
      m[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/).pop()?.trim() ?? '')
        .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s))
        .forEach((s) => found.add(s))
    }
  }
  return [...found]
}

/** Renderiza o bloco determinístico do AGENTS.md (fatos, sem LLM). */
export function renderFactsBlock(facts: RepoFacts): string {
  const lines: string[] = ['<!-- FATOS EXTRAÍDOS DO REPOSITÓRIO (determinístico, não editar à mão) -->']
  if (facts.name) lines.push(`# ${facts.name}`, '')
  if (facts.description) lines.push(facts.description, '')

  if (Object.keys(facts.scripts).length) {
    lines.push('## Comandos (package.json scripts)')
    for (const [k, v] of Object.entries(facts.scripts)) lines.push(`- \`npm run ${k}\` — \`${v}\``)
    lines.push('')
  }
  if (facts.entryPoints.length) {
    lines.push('## Entry points', ...facts.entryPoints.map((e) => `- \`${e}\``), '')
  }
  if (facts.topDirs.length) {
    lines.push('## Diretórios de topo', ...facts.topDirs.map((d) => `- \`${d}/\``), '')
  }
  if (facts.exports.length) {
    lines.push('## Símbolos públicos (amostra)')
    const byFile = new Map<string, string[]>()
    for (const e of facts.exports) {
      if (!byFile.has(e.path)) byFile.set(e.path, [])
      byFile.get(e.path)!.push(e.symbol)
    }
    for (const [path, syms] of byFile) lines.push(`- \`${path}\`: ${syms.join(', ')}`)
    lines.push('')
  }
  return lines.join('\n')
}
