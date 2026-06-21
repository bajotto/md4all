import { getVault, isSftp, listTree, readFile } from './vault'
import type { FileNode } from './types'

/** Metadados extraídos de uma nota markdown. */
export interface NoteMeta {
  path: string // relativo ao vault
  title: string
  tags: string[]
  links: string[] // alvos de wikilinks ([[alvo]]) — nome cru
}

export interface BacklinkRef {
  path: string
  title: string
}

export interface TagInfo {
  tag: string
  count: number
}

export interface NoteRef {
  path: string
  title: string
}

interface VaultIdx {
  notes: Map<string, NoteMeta>
}

const cache = new Map<string, VaultIdx>()

function collectFiles(nodes: FileNode[], out: string[]): void {
  for (const n of nodes) {
    if (n.isDir) collectFiles(n.children ?? [], out)
    else if (/\.(md|markdown|mdown|mkd)$/i.test(n.path)) out.push(n.path)
  }
}

function baseName(p: string): string {
  const last = p.split('/').pop() ?? p
  return last.replace(/\.[^.]+$/, '')
}

/** Remove blocos de código cercados para não captar #tags / [[links]] dentro deles. */
function stripFences(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let fence: string | null = null
  for (const line of lines) {
    const m = line.match(/^\s{0,3}(```+|~~~+)/)
    if (m) {
      if (fence === null) fence = m[1][0]
      else if (line.trim().startsWith(fence)) fence = null
      out.push('')
      continue
    }
    out.push(fence ? '' : line)
  }
  return out.join('\n')
}

function parseFrontmatter(md: string): { title?: string; tags: string[]; body: string } {
  const tags: string[] = []
  let title: string | undefined
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!fm) return { tags, body: md }
  const block = fm[1]
  const body = md.slice(fm[0].length)
  const lines = block.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.match(/^title:\s*(.+)$/i)
    if (t) title = t[1].trim().replace(/^["']|["']$/g, '')
    const tg = line.match(/^tags:\s*(.*)$/i)
    if (tg) {
      const rest = tg[1].trim()
      if (rest.startsWith('[')) {
        // tags: [a, b, c]
        rest
          .replace(/^\[|\]$/g, '')
          .split(',')
          .forEach((s) => {
            const v = s.trim().replace(/^["']|["']$/g, '')
            if (v) tags.push(v)
          })
      } else if (rest) {
        // tags: a b  ou  tags: a, b
        rest.split(/[,\s]+/).forEach((s) => {
          const v = s.replace(/^["']|["']$/g, '')
          if (v) tags.push(v)
        })
      } else {
        // bloco YAML:  tags:\n  - a\n  - b
        for (let j = i + 1; j < lines.length; j++) {
          const item = lines[j].match(/^\s*-\s*(.+)$/)
          if (!item) break
          tags.push(item[1].trim().replace(/^["']|["']$/g, ''))
        }
      }
    }
  }
  return { title, tags, body }
}

function parseNote(relPath: string, raw: string): NoteMeta {
  const { title: fmTitle, tags: fmTags, body } = parseFrontmatter(raw)
  const clean = stripFences(body)

  // tags inline #tag (não confundir com headings "# " nem com ##)
  const tagSet = new Set(fmTags)
  for (const m of clean.matchAll(/(?:^|[\s(])#([A-Za-z][\w/-]*)/g)) {
    tagSet.add(m[1])
  }

  // wikilinks [[alvo]] ou [[alvo|alias]] ou [[alvo#secao]]
  const links: string[] = []
  for (const m of clean.matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
    const target = m[1].split('|')[0].split('#')[0].trim()
    if (target) links.push(target)
  }

  // título: frontmatter > primeiro H1 > nome do arquivo
  let title = fmTitle
  if (!title) {
    const h1 = clean.match(/^#\s+(.+?)\s*#*\s*$/m)
    if (h1) title = h1[1].trim()
  }
  if (!title) title = baseName(relPath)

  return { path: relPath, title, tags: [...tagSet], links }
}

async function readNote(vaultId: string, relPath: string): Promise<NoteMeta | null> {
  try {
    const raw = await readFile(vaultId, relPath)
    return parseNote(relPath, raw)
  } catch {
    return null
  }
}

/** (Re)constrói o índice completo de um vault. */
export async function buildIndex(vaultId: string): Promise<void> {
  // Vaults remotos (SFTP) NÃO são indexados: exigiria varrer e ler toda a
  // árvore por rede a cada carga. PKM (wikilinks/tags/backlinks) é local-only.
  if (isSftp(getVault(vaultId))) {
    cache.set(vaultId, { notes: new Map() })
    return
  }
  const tree = await listTree(vaultId)
  const files: string[] = []
  collectFiles(tree, files)
  const notes = new Map<string, NoteMeta>()
  for (const rel of files) {
    const meta = await readNote(vaultId, rel)
    if (meta) notes.set(rel, meta)
  }
  cache.set(vaultId, { notes })
}

async function ensureIndex(vaultId: string): Promise<VaultIdx> {
  let idx = cache.get(vaultId)
  if (!idx) {
    await buildIndex(vaultId)
    idx = cache.get(vaultId)!
  }
  return idx
}

/** Atualiza uma única nota no índice (após escrita ou mudança externa). */
export async function touchNote(vaultId: string, relPath: string): Promise<void> {
  if (!/\.(md|markdown|mdown|mkd)$/i.test(relPath)) return
  const idx = cache.get(vaultId)
  if (!idx) return // será construído sob demanda na próxima consulta
  const meta = await readNote(vaultId, relPath)
  if (meta) idx.notes.set(relPath, meta)
  else idx.notes.delete(relPath)
}

export function removeNote(vaultId: string, relPath: string): void {
  cache.get(vaultId)?.notes.delete(relPath)
}

export function dropVault(vaultId: string): void {
  cache.delete(vaultId)
}

/** Resolve o alvo de um wikilink para o caminho de uma nota (ou null). */
function resolveTarget(idx: VaultIdx, target: string): NoteMeta | null {
  const want = target.replace(/^\.\//, '').replace(/\\/g, '/').toLowerCase()
  const wantNoExt = want.replace(/\.(md|markdown|mdown|mkd)$/i, '')
  for (const meta of idx.notes.values()) {
    const p = meta.path.toLowerCase()
    const pNoExt = p.replace(/\.(md|markdown|mdown|mkd)$/i, '')
    if (pNoExt === wantNoExt || p === want) return meta
  }
  // por basename
  for (const meta of idx.notes.values()) {
    if (baseName(meta.path).toLowerCase() === wantNoExt) return meta
  }
  // por título (permite [[Título]] mesmo com nome de arquivo diferente/slug)
  for (const meta of idx.notes.values()) {
    if (meta.title.toLowerCase() === wantNoExt) return meta
  }
  return null
}

export async function resolveLink(vaultId: string, target: string): Promise<string | null> {
  const idx = await ensureIndex(vaultId)
  return resolveTarget(idx, target)?.path ?? null
}

export async function backlinksFor(vaultId: string, relPath: string): Promise<BacklinkRef[]> {
  const idx = await ensureIndex(vaultId)
  const targetNoExt = relPath.toLowerCase().replace(/\.(md|markdown|mdown|mkd)$/i, '')
  const refs: BacklinkRef[] = []
  for (const meta of idx.notes.values()) {
    if (meta.path === relPath) continue
    for (const link of meta.links) {
      const resolved = resolveTarget(idx, link)
      if (resolved && resolved.path.toLowerCase().replace(/\.(md|markdown|mdown|mkd)$/i, '') === targetNoExt) {
        refs.push({ path: meta.path, title: meta.title })
        break
      }
    }
  }
  refs.sort((a, b) => a.title.localeCompare(b.title))
  return refs
}

export async function allTags(vaultId: string): Promise<TagInfo[]> {
  const idx = await ensureIndex(vaultId)
  const counts = new Map<string, number>()
  for (const meta of idx.notes.values()) {
    for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export async function notesForTag(vaultId: string, tag: string): Promise<NoteRef[]> {
  const idx = await ensureIndex(vaultId)
  const want = tag.toLowerCase()
  const out: NoteRef[] = []
  for (const meta of idx.notes.values()) {
    if (meta.tags.some((t) => t.toLowerCase() === want)) out.push({ path: meta.path, title: meta.title })
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}

/** Lista todas as notas (para autocomplete de wikilinks). */
export async function listNotes(vaultId: string): Promise<NoteRef[]> {
  const idx = await ensureIndex(vaultId)
  return [...idx.notes.values()]
    .map((m) => ({ path: m.path, title: m.title }))
    .sort((a, b) => a.title.localeCompare(b.title))
}
