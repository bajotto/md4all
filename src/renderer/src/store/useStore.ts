import { create } from 'zustand'
import type {
  AppSettings,
  BacklinkRef,
  EditorMode,
  FileNode,
  NoteRef,
  OpenTab,
  SearchHit,
  SftpInput,
  TagInfo,
  Vault
} from '../types'
import { tabKey } from '../types'
import { setChildrenAt, setHasMdAt } from './treeUtil'

const api = window.api

// Sondagem de "pasta tem .md?" para vaults SFTP: serial (1 por vez, pois a
// conexão transitória não é reentrante) e em background — nunca bloqueia a UI.
const probedMd = new Set<string>()
let probeChain: Promise<void> = Promise.resolve()
function queueMdProbe(vaultId: string, relPath: string, apply: (hasMd: boolean) => void): void {
  const key = `${vaultId}::${relPath}`
  if (probedMd.has(key)) return
  probedMd.add(key)
  probeChain = probeChain.then(async () => {
    try {
      const has = (await api.hasMarkdown(vaultId, relPath)) as boolean
      if (has) apply(true)
    } catch {
      /* sondagem é best-effort */
    }
  })
}

interface ActiveRef {
  vaultId: string
  path: string
}

interface Clipboard {
  vaultId: string
  path: string
}

interface State {
  vaults: Vault[]
  theme: 'light' | 'dark'
  clipboard: Clipboard | null

  // multi-raiz: árvore e estado de expansão por vault
  trees: Record<string, FileNode[]>
  expanded: Record<string, boolean>
  loadingTree: Record<string, boolean>
  loadingDir: Record<string, boolean> // "vaultId::relPath" → carregando filhos (lazy SFTP)

  tabs: OpenTab[]
  active: ActiveRef | null
  editorMode: EditorMode
  outlineOpen: boolean

  searchQuery: string
  searchResults: SearchHit[]
  searching: boolean

  // PKM (índice: wikilinks / tags / backlinks)
  backlinks: BacklinkRef[]
  tagFilter: { tag: string; notes: NoteRef[] } | null

  // bootstrap / config
  init: () => Promise<void>
  loadTree: (vaultId: string) => Promise<void>
  loadDir: (vaultId: string, relPath: string) => Promise<void>
  probeMd: (vaultId: string, nodes: FileNode[]) => void
  refreshTree: (vaultId: string) => Promise<void>
  toggleVaultExpanded: (vaultId: string) => Promise<void>
  addVaultFromPicker: () => Promise<void>
  addVaultByPath: (path: string, name?: string) => Promise<boolean>
  addSftpVault: (input: SftpInput) => Promise<boolean>
  removeVault: (vaultId: string) => Promise<void>
  toggleTheme: () => Promise<void>

  // arquivos
  openFile: (vaultId: string, relPath: string) => Promise<void>
  closeTab: (vaultId: string, relPath: string) => void
  closeAllTabs: () => void
  setActiveTab: (vaultId: string, relPath: string) => void
  updateContent: (vaultId: string, relPath: string, content: string) => void
  saveTab: (vaultId: string, relPath: string) => Promise<void>
  createFile: (vaultId: string, relPath: string) => Promise<void>
  createFolder: (vaultId: string, relPath: string) => Promise<void>
  renamePath: (vaultId: string, from: string, to: string) => Promise<void>
  deletePath: (vaultId: string, relPath: string) => Promise<void>
  copyPath: (vaultId: string, relPath: string) => void
  pastePath: (vaultId: string, toDir: string) => Promise<void>
  reloadTabFromDisk: (vaultId: string, relPath: string) => Promise<void>

  setEditorMode: (mode: EditorMode) => void
  toggleOutline: () => void

  runSearch: (query: string) => Promise<void>
  clearSearch: () => void

  // PKM
  loadBacklinks: () => Promise<void>
  openWikilink: (target: string) => Promise<void>
  filterByTag: (tag: string) => Promise<void>
  clearTagFilter: () => void
  loadTags: () => Promise<TagInfo[]>

  exportActive: (format: 'html' | 'pdf') => Promise<string | null>

  applySettings: (s: AppSettings) => void
  activeTab: () => OpenTab | null
}

function basename(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1]
}

export const useStore = create<State>((set, get) => ({
  vaults: [],
  theme: 'light',
  clipboard: null,
  trees: {},
  expanded: {},
  loadingTree: {},
  loadingDir: {},
  tabs: [],
  active: null,
  editorMode: 'wysiwyg',
  outlineOpen: true,
  searchQuery: '',
  searchResults: [],
  searching: false,
  backlinks: [],
  tagFilter: null,

  applySettings: (s) => {
    set({ vaults: s.vaults, theme: s.theme })
    document.documentElement.dataset.theme = s.theme
  },

  activeTab: () => {
    const { active, tabs } = get()
    if (!active) return null
    return tabs.find((t) => t.vaultId === active.vaultId && t.path === active.path) ?? null
  },

  init: async () => {
    const s = (await api.getSettings()) as AppSettings
    get().applySettings(s)
    // observa e carrega cada vault; locais expandidos por padrão,
    // remotos (sftp) ficam recolhidos até o usuário clicar (rede).
    const expanded: Record<string, boolean> = {}
    for (const v of s.vaults) {
      await api.watchVault(v.id)
      if (v.kind !== 'sftp') {
        expanded[v.id] = true
        await get().loadTree(v.id)
      } else {
        expanded[v.id] = false
      }
    }
    set({ expanded })
  },

  loadTree: async (vaultId) => {
    set({ loadingTree: { ...get().loadingTree, [vaultId]: true } })
    try {
      // SFTP: carrega só o nível raiz (subpastas carregam ao expandir — evita
      // varrer um repo remoto inteiro). Local: árvore completa (rápido, disco).
      const isSftp = get().vaults.find((v) => v.id === vaultId)?.kind === 'sftp'
      const tree = (await (isSftp ? api.listDir(vaultId, '') : api.tree(vaultId))) as FileNode[]
      set({ trees: { ...get().trees, [vaultId]: tree } })
      if (isSftp) get().probeMd(vaultId, tree)
      // constrói o índice de PKM em segundo plano (wikilinks/tags/backlinks)
      void api
        .indexBuild(vaultId)
        .then(() => get().loadBacklinks())
        .catch(() => {
          /* índice pode falhar em vault remoto grande; não bloqueia a árvore */
        })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await api.showError(`Falha ao listar o vault:\n${msg}`)
    } finally {
      set({ loadingTree: { ...get().loadingTree, [vaultId]: false } })
    }
  },

  loadDir: async (vaultId, relPath) => {
    const key = `${vaultId}::${relPath}`
    if (get().loadingDir[key]) return
    set({ loadingDir: { ...get().loadingDir, [key]: true } })
    try {
      const children = (await api.listDir(vaultId, relPath)) as FileNode[]
      const tree = get().trees[vaultId]
      if (tree) set({ trees: { ...get().trees, [vaultId]: setChildrenAt(tree, relPath, children) } })
      if (get().vaults.find((v) => v.id === vaultId)?.kind === 'sftp') get().probeMd(vaultId, children)
    } catch (err) {
      await api.showError(`Falha ao listar a pasta:\n${err instanceof Error ? err.message : String(err)}`)
    } finally {
      set({ loadingDir: { ...get().loadingDir, [key]: false } })
    }
  },

  // enfileira sondagem "tem .md?" para cada filho-diretório (vault SFTP); ao
  // confirmar, marca o nó e a árvore re-renderiza com a pasta destacada.
  probeMd: (vaultId, nodes) => {
    for (const n of nodes) {
      if (!n.isDir || n.hasMd !== undefined) continue
      queueMdProbe(vaultId, n.path, (hasMd) => {
        const tree = get().trees[vaultId]
        if (tree) set({ trees: { ...get().trees, [vaultId]: setHasMdAt(tree, n.path, hasMd) } })
      })
    }
  },

  refreshTree: async (vaultId) => {
    if (get().expanded[vaultId]) await get().loadTree(vaultId)
  },

  toggleVaultExpanded: async (vaultId) => {
    const open = !get().expanded[vaultId]
    set({ expanded: { ...get().expanded, [vaultId]: open } })
    if (open && !get().trees[vaultId]) await get().loadTree(vaultId)
  },

  addVaultFromPicker: async () => {
    const picked = (await api.pickFolder()) as { path: string; name: string } | null
    if (!picked) return
    await get().addVaultByPath(picked.path, picked.name)
  },

  addVaultByPath: async (vaultPath, name) => {
    try {
      const vault = (await api.addVault(name ?? '', vaultPath)) as Vault
      const s = (await api.getSettings()) as AppSettings
      get().applySettings(s)
      await api.watchVault(vault.id)
      set({ expanded: { ...get().expanded, [vault.id]: true } })
      await get().loadTree(vault.id)
      return true
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
      return false
    }
  },

  addSftpVault: async (input) => {
    try {
      const vault = (await api.addSftp(input)) as Vault
      const s = (await api.getSettings()) as AppSettings
      get().applySettings(s)
      // adiciona COLAPSADO e não bloqueia: a árvore remota carrega lazy ao expandir
      // (evita o "Conectando…" infinito ao varrer um repo grande via SFTP).
      set({ expanded: { ...get().expanded, [vault.id]: false } })
      return true
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
      return false
    }
  },

  removeVault: async (vaultId) => {
    await api.unwatchVault(vaultId)
    await api.removeVault(vaultId)
    const s = (await api.getSettings()) as AppSettings
    get().applySettings(s)
    // remove abas, árvore e estado do vault
    const tabs = get().tabs.filter((t) => t.vaultId !== vaultId)
    const trees = { ...get().trees }
    delete trees[vaultId]
    let active = get().active
    if (active?.vaultId === vaultId) active = tabs[0] ? { vaultId: tabs[0].vaultId, path: tabs[0].path } : null
    set({ tabs, trees, active })
  },

  toggleTheme: async () => {
    const theme = get().theme === 'light' ? 'dark' : 'light'
    const s = (await api.setSettings({ theme })) as AppSettings
    get().applySettings(s)
  },

  openFile: async (vaultId, relPath) => {
    const existing = get().tabs.find((t) => t.vaultId === vaultId && t.path === relPath)
    if (existing) {
      set({ active: { vaultId, path: relPath } })
      void get().loadBacklinks()
      return
    }
    try {
      const content = (await api.read(vaultId, relPath)) as string
      const tab: OpenTab = { vaultId, path: relPath, name: basename(relPath), content, dirty: false }
      set({ tabs: [...get().tabs, tab], active: { vaultId, path: relPath } })
      void get().loadBacklinks()
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  closeTab: (vaultId, relPath) => {
    const { tabs, active } = get()
    const idx = tabs.findIndex((t) => t.vaultId === vaultId && t.path === relPath)
    if (idx === -1) return
    const next = tabs.filter((t) => !(t.vaultId === vaultId && t.path === relPath))
    let nextActive = active
    if (active && active.vaultId === vaultId && active.path === relPath) {
      const cand = next[idx] ?? next[idx - 1] ?? null
      nextActive = cand ? { vaultId: cand.vaultId, path: cand.path } : null
    }
    set({ tabs: next, active: nextActive })
  },

  closeAllTabs: () => {
    if (get().tabs.length === 0) return
    set({ tabs: [], active: null })
  },

  setActiveTab: (vaultId, relPath) => {
    set({ active: { vaultId, path: relPath } })
    void get().loadBacklinks()
  },

  updateContent: (vaultId, relPath, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.vaultId === vaultId && t.path === relPath ? { ...t, content, dirty: true } : t
      )
    })
  },

  saveTab: async (vaultId, relPath) => {
    const tab = get().tabs.find((t) => t.vaultId === vaultId && t.path === relPath)
    if (!tab || !tab.dirty) return
    try {
      await api.write(vaultId, relPath, tab.content)
      set({
        tabs: get().tabs.map((t) =>
          t.vaultId === vaultId && t.path === relPath ? { ...t, dirty: false } : t
        )
      })
    } catch (err) {
      await api.showError(`Falha ao salvar:\n${err instanceof Error ? err.message : String(err)}`)
    }
  },

  createFile: async (vaultId, relPath) => {
    const finalPath = relPath.endsWith('.md') ? relPath : `${relPath}.md`
    try {
      await api.createFile(vaultId, finalPath)
      // marca pais como tendo .md (evita lag visual)
      set({
        trees: {
          ...get().trees,
          [vaultId]: setHasMdAt(get().trees[vaultId] ?? [], finalPath, true)
        }
      })
      await get().refreshTree(vaultId)
      await get().openFile(vaultId, finalPath)
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  createFolder: async (vaultId, relPath) => {
    try {
      await api.createFolder(vaultId, relPath)
      await get().refreshTree(vaultId)
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  renamePath: async (vaultId, from, to) => {
    try {
      await api.rename(vaultId, from, to)
      // marca novo caminho com hasMd se for .md (evita lag visual)
      const isMd = /\.(md|markdown|mdown|mkd)$/i.test(to)
      const trees = get().trees[vaultId] ?? []
      set({
        tabs: get().tabs.map((t) =>
          t.vaultId === vaultId && t.path === from ? { ...t, path: to, name: basename(to) } : t
        ),
        active:
          get().active?.vaultId === vaultId && get().active?.path === from
            ? { vaultId, path: to }
            : get().active,
        trees: isMd ? { ...get().trees, [vaultId]: setHasMdAt(trees, to, true) } : get().trees
      })
      await get().refreshTree(vaultId)
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  deletePath: async (vaultId, relPath) => {
    try {
      await api.remove(vaultId, relPath)
      const affected = get().tabs.filter(
        (t) => t.vaultId === vaultId && (t.path === relPath || t.path.startsWith(relPath + '/'))
      )
      for (const t of affected) get().closeTab(t.vaultId, t.path)
      await get().refreshTree(vaultId)
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  copyPath: (vaultId, relPath) => {
    set({ clipboard: { vaultId, path: relPath } })
  },

  pastePath: async (vaultId, toDir) => {
    const clipboard = get().clipboard
    if (!clipboard) {
      await api.showError('Nada copiado')
      return
    }
    try {
      const basename = clipboard.path.split('/').pop() || 'cópia'
      const targetPath = toDir ? `${toDir}/${basename}` : basename
      // evita copiar para si mesmo
      if (clipboard.vaultId === vaultId && clipboard.path === targetPath) {
        await api.showError('Não é possível colar no mesmo local')
        return
      }
      const content = (await api.read(clipboard.vaultId, clipboard.path)) as string
      await api.createFile(vaultId, targetPath)
      await api.write(vaultId, targetPath, content)
      await get().refreshTree(vaultId)
      // marca pais como tendo .md se for markdown
      if (/\.(md|markdown|mdown|mkd)$/i.test(targetPath)) {
        set({
          trees: {
            ...get().trees,
            [vaultId]: setHasMdAt(get().trees[vaultId] ?? [], targetPath, true)
          }
        })
      }
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  reloadTabFromDisk: async (vaultId, relPath) => {
    const tab = get().tabs.find((t) => t.vaultId === vaultId && t.path === relPath)
    if (!tab || tab.dirty) return
    try {
      const content = (await api.read(vaultId, relPath)) as string
      set({
        tabs: get().tabs.map((t) =>
          t.vaultId === vaultId && t.path === relPath ? { ...t, content, dirty: false } : t
        )
      })
    } catch {
      /* arquivo pode ter sumido */
    }
  },

  setEditorMode: (mode) => set({ editorMode: mode }),

  toggleOutline: () => set({ outlineOpen: !get().outlineOpen }),

  runSearch: async (query) => {
    set({ searchQuery: query })
    const { vaults } = get()
    if (!query.trim() || vaults.length === 0) {
      set({ searchResults: [], searching: false })
      return
    }
    set({ searching: true })
    const all: SearchHit[] = []
    for (const v of vaults) {
      try {
        const hits = (await api.search(v.id, query)) as Array<{
          path: string
          line: number
          preview: string
        }>
        for (const h of hits) all.push({ ...h, vaultId: v.id, vaultName: v.name })
      } catch {
        /* ignora vault que falhar (ex.: sftp offline) */
      }
    }
    set({ searchResults: all, searching: false })
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [] }),

  loadBacklinks: async () => {
    const { active } = get()
    if (!active) {
      set({ backlinks: [] })
      return
    }
    try {
      const refs = (await api.indexBacklinks(active.vaultId, active.path)) as BacklinkRef[]
      // só aplica se ainda for o arquivo ativo (evita corrida ao trocar de aba)
      const cur = get().active
      if (cur && cur.vaultId === active.vaultId && cur.path === active.path) set({ backlinks: refs })
    } catch {
      set({ backlinks: [] })
    }
  },

  openWikilink: async (target) => {
    const { active } = get()
    if (!active) return
    try {
      const resolved = (await api.indexResolve(active.vaultId, target)) as string | null
      if (resolved) await get().openFile(active.vaultId, resolved)
      else await api.showError(`Nota não encontrada: [[${target}]]`)
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  filterByTag: async (tag) => {
    const { active, vaults } = get()
    const vaultId = active?.vaultId ?? vaults[0]?.id
    if (!vaultId) return
    try {
      const notes = (await api.indexNotesForTag(vaultId, tag)) as NoteRef[]
      set({ tagFilter: { tag, notes } })
    } catch {
      set({ tagFilter: { tag, notes: [] } })
    }
  },

  clearTagFilter: () => set({ tagFilter: null }),

  loadTags: async () => {
    const { active, vaults } = get()
    const vaultId = active?.vaultId ?? vaults[0]?.id
    if (!vaultId) return []
    try {
      return (await api.indexTags(vaultId)) as TagInfo[]
    } catch {
      return []
    }
  },

  exportActive: async (format) => {
    const tab = get().activeTab()
    if (!tab) return null
    if (tab.dirty) await get().saveTab(tab.vaultId, tab.path)
    const fn = format === 'pdf' ? api.exportPdf : api.exportHtml
    return (await fn(tab.vaultId, tab.path, tab.content)) as string | null
  },

  // mantém tabKey acessível para componentes
}))

export { tabKey }
