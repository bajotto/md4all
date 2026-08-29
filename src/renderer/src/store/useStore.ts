import { create } from 'zustand'
import type {
  AiHit,
  AppSettings,
  BacklinkRef,
  EditorMode,
  FileNode,
  LlmUsage,
  NoteRef,
  OpenTab,
  RevealTarget,
  SearchHit,
  SftpInput,
  TagInfo,
  Vault
} from '../types'
import { tabKey } from '../types'
import { setChildrenAt, setHasMdAt } from './treeUtil'

const api = window.api

// "folder has .md?" probing for SFTP vaults: serial (1 at a time, since the
// transient connection is not reentrant) and in background — never blocks the UI.
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
      /* probing is best-effort */
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

  // multi-root: tree and expansion state per vault
  trees: Record<string, FileNode[]>
  expanded: Record<string, boolean>
  loadingTree: Record<string, boolean>
  loadingDir: Record<string, boolean> // "vaultId::relPath" → loading children (lazy SFTP)

  tabs: OpenTab[]
  active: ActiveRef | null
  editorMode: EditorMode
  outlineOpen: boolean

  searchQuery: string
  searchResults: SearchHit[]
  searching: boolean

  // search panel (right drawer) + AI search
  searchPanelOpen: boolean
  searchMode: 'local' | 'hibrida'
  aiQuery: string
  aiResults: AiHit[]
  aiSearching: boolean
  aiUsage: LlmUsage | null
  aiError: string | null
  revealTarget: RevealTarget | null

  // LLM settings modal (shared so it can be opened from the AI panel)
  llmSettingsOpen: boolean

  // true when token + 2 models are configured (source of truth to block LLM UI)
  llmConfigured: boolean
  refreshLlmConfigured: () => Promise<void>

  // PKM (index: wikilinks / tags / backlinks)
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

  // files
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
  checkFileStale: (vaultId: string, relPath: string) => Promise<void>
  reloadTabFromDisk: (vaultId: string, relPath: string) => Promise<void>

  setEditorMode: (mode: EditorMode) => void
  toggleOutline: () => void

  runSearch: (query: string) => Promise<void>
  clearSearch: () => void

  // search panel + AI + reveal
  toggleSearchPanel: () => void
  openSearchPanel: (mode?: 'local' | 'hibrida') => void
  closeSearchPanel: () => void
  setSearchMode: (mode: 'local' | 'hibrida') => void
  runAiSearch: (query: string) => Promise<void>
  clearAiSearch: () => void
  revealHit: (hit: SearchHit) => Promise<void>
  clearReveal: () => void
  setLlmSettingsOpen: (open: boolean) => void

  // PKM
  loadBacklinks: () => Promise<void>
  openWikilink: (target: string) => Promise<void>
  openRelativeLink: (href: string) => Promise<void>
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
  searchPanelOpen: false,
  searchMode: 'local',
  aiQuery: '',
  aiResults: [],
  aiSearching: false,
  aiUsage: null,
  aiError: null,
  revealTarget: null,
  llmSettingsOpen: false,
  llmConfigured: false,
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
    // observes and loads each vault; local ones expanded by default,
    // remote (sftp) stay collapsed until the user clicks (network).
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
    // onboarding: if the LLM is not configured, opens the ⚙ modal automatically
    // (each user needs to add their own OpenRouter key — nothing embedded)
    await get().refreshLlmConfigured()
    if (!get().llmConfigured) set({ llmSettingsOpen: true })
  },

  loadTree: async (vaultId) => {
    set({ loadingTree: { ...get().loadingTree, [vaultId]: true } })
    try {
      // SFTP: loads only the root level (subfolders load on expand — avoids
      // scanning an entire remote repo). Local: full tree (fast, disk).
      const isSftp = get().vaults.find((v) => v.id === vaultId)?.kind === 'sftp'
      const tree = (await (isSftp ? api.listDir(vaultId, '') : api.tree(vaultId))) as FileNode[]
      set({ trees: { ...get().trees, [vaultId]: tree } })
      if (isSftp) get().probeMd(vaultId, tree)
      // builds the PKM index in the background (wikilinks/tags/backlinks)
      void api
        .indexBuild(vaultId)
        .then(() => get().loadBacklinks())
        .catch(() => {
          /* index may fail on a large remote vault; does not block the tree */
        })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await api.showError(`Failed to list vault:\n${msg}`)
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
      await api.showError(`Failed to list folder:\n${err instanceof Error ? err.message : String(err)}`)
    } finally {
      set({ loadingDir: { ...get().loadingDir, [key]: false } })
    }
  },

  // queues "has .md?" probing for each subdirectory (SFTP vault); upon
  // confirmation, marks the node and the tree re-renders with the folder highlighted.
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
      // adds COLLAPSED and does not block: the remote tree loads lazily on expand
      // (avoids the infinite "Connecting…" when scanning a large repo via SFTP).
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
    // removes tabs, tree, and vault state
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
      const { content, modifiedAt } = (await api.readMeta(vaultId, relPath)) as {
        content: string
        modifiedAt: number
      }
      const tab: OpenTab = {
        vaultId,
        path: relPath,
        name: basename(relPath),
        content,
        dirty: false,
        modifiedAt,
        stale: false
      }
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
    void get().checkFileStale(vaultId, relPath)
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
      await api.showError(`Failed to save:\n${err instanceof Error ? err.message : String(err)}`)
    }
  },

  createFile: async (vaultId, relPath) => {
    const finalPath = relPath.endsWith('.md') ? relPath : `${relPath}.md`
    try {
      await api.createFile(vaultId, finalPath)
      // marks parents as having .md (avoids visual lag)
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
      // marks new path with hasMd if it's .md (avoids visual lag)
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
      await api.showError('Nothing copied')
      return
    }
    try {
      const basename = clipboard.path.split('/').pop() || 'copy'
      const targetPath = toDir ? `${toDir}/${basename}` : basename
      // avoids copying onto itself
      if (clipboard.vaultId === vaultId && clipboard.path === targetPath) {
        await api.showError('Cannot paste into the same location')
        return
      }
      const content = (await api.read(clipboard.vaultId, clipboard.path)) as string
      await api.createFile(vaultId, targetPath)
      await api.write(vaultId, targetPath, content)
      await get().refreshTree(vaultId)
      // marks parents as having .md if it's markdown
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

  checkFileStale: async (vaultId, relPath) => {
    const tab = get().tabs.find((t) => t.vaultId === vaultId && t.path === relPath)
    if (!tab || !tab.modifiedAt) return
    try {
      const { modifiedAt: currentMt } = (await api.readMeta(vaultId, relPath)) as {
        content: string
        modifiedAt: number
      }
      const stale = currentMt > tab.modifiedAt
      set({
        tabs: get().tabs.map((t) =>
          t.vaultId === vaultId && t.path === relPath ? { ...t, stale } : t
        )
      })
    } catch {
      /* file may have disappeared */
    }
  },

  reloadTabFromDisk: async (vaultId, relPath) => {
    const tab = get().tabs.find((t) => t.vaultId === vaultId && t.path === relPath)
    if (!tab || tab.dirty) return
    try {
      const { content, modifiedAt } = (await api.readMeta(vaultId, relPath)) as {
        content: string
        modifiedAt: number
      }
      set({
        tabs: get().tabs.map((t) =>
          t.vaultId === vaultId && t.path === relPath
            ? { ...t, content, dirty: false, modifiedAt, stale: false }
            : t
        )
      })
    } catch {
      /* file may have disappeared */
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
    const settled = await Promise.all(
      vaults.map((v) =>
        (api.search(v.id, query) as Promise<Array<{ path: string; line: number; preview: string }>>)
          .then((hits) => hits.map((h) => ({ ...h, vaultId: v.id, vaultName: v.name })))
          .catch(() => [] as SearchHit[])
      )
    )
    // discards result if the user already typed another query (race condition)
    if (get().searchQuery !== query) return
    set({ searchResults: settled.flat(), searching: false })
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [], searching: false }),

  toggleSearchPanel: () => set({ searchPanelOpen: !get().searchPanelOpen }),
  openSearchPanel: (mode) =>
    set({ searchPanelOpen: true, ...(mode ? { searchMode: mode } : {}) }),
  closeSearchPanel: () => set({ searchPanelOpen: false }),
  setSearchMode: (mode) => set({ searchMode: mode }),

  runAiSearch: async (query) => {
    const { vaults } = get()
    set({ aiQuery: query })
    if (!query.trim() || vaults.length === 0) {
      set({ aiResults: [], aiSearching: false, aiUsage: null, aiError: null })
      return
    }
    set({ aiSearching: true, aiError: null, aiResults: [], aiUsage: null })
    // searches ALL vaults (same as literal search) — not just the active vault
    const settled = await Promise.allSettled(
      vaults.map((v) =>
        (
          api.aiSearch(v.id, query) as Promise<{
            results: Array<{ path: string; summary: string; score: number }>
            usage: LlmUsage
          }>
        ).then((res) => ({ vaultId: v.id, vaultName: v.name, ...res }))
      )
    )
    // discards result if the user changed the query while the search was running
    if (get().aiQuery !== query) {
      set({ aiSearching: false })
      return
    }
    const ok = settled.filter(
      (r): r is PromiseFulfilledResult<{
        vaultId: string
        vaultName: string
        results: Array<{ path: string; summary: string; score: number }>
        usage: LlmUsage
      }> => r.status === 'fulfilled'
    )
    if (ok.length === 0) {
      const firstErr = settled.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )?.reason
      set({
        aiSearching: false,
        aiError: firstErr instanceof Error ? firstErr.message : String(firstErr)
      })
      return
    }
    const results: AiHit[] = ok
      .flatMap((r) => r.value.results.map((h) => ({ ...h, vaultId: r.value.vaultId, vaultName: r.value.vaultName })))
      .sort((a, b) => b.score - a.score)
    const usage = ok.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.value.usage.promptTokens,
        completionTokens: acc.completionTokens + r.value.usage.completionTokens,
        cost: acc.cost + r.value.usage.cost,
        calls: acc.calls + r.value.usage.calls
      }),
      { promptTokens: 0, completionTokens: 0, cost: 0, calls: 0 }
    )
    set({ aiResults: results, aiUsage: usage, aiSearching: false })
  },

  clearAiSearch: () =>
    set({ aiQuery: '', aiResults: [], aiUsage: null, aiError: null, aiSearching: false }),

  // opens the hit's file and marks the line/term for the editor to reveal.
  // Captures searchQuery before the await to avoid stale value (e.g. SFTP).
  revealHit: async (hit) => {
    const query = get().searchQuery
    await get().openFile(hit.vaultId, hit.path)
    set({ revealTarget: { vaultId: hit.vaultId, path: hit.path, line: hit.line, query } })
  },

  clearReveal: () => set({ revealTarget: null }),

  setLlmSettingsOpen: (open) => {
    set({ llmSettingsOpen: open })
    // when closing the modal, reloads the "LLM configured" state (user may have saved key/models)
    if (!open) void get().refreshLlmConfigured()
  },

  // queries the main process (llm:getConfig) and updates llmConfigured — source of truth to block LLM UI
  refreshLlmConfigured: async () => {
    try {
      const cfg = (await api.llmGetConfig()) as {
        hasToken: boolean
        modelPrimary: string
        modelReviewer: string
      }
      set({ llmConfigured: !!cfg.hasToken && !!cfg.modelPrimary && !!cfg.modelReviewer })
    } catch {
      set({ llmConfigured: false })
    }
  },

  loadBacklinks: async () => {
    const { active } = get()
    if (!active) {
      set({ backlinks: [] })
      return
    }
    try {
      const refs = (await api.indexBacklinks(active.vaultId, active.path)) as BacklinkRef[]
      // only applies if still the active file (avoids race when switching tabs)
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
      else await api.showError(`Note not found: [[${target}]]`)
    } catch (err) {
      await api.showError(err instanceof Error ? err.message : String(err))
    }
  },

  // clicking a regular markdown link ([text](other.md)) pointing to another
  // note in the vault — resolves the path relative to the current file and opens
  // it in the tab, instead of letting Electron try to navigate/open in the OS default app
  openRelativeLink: async (href) => {
    const { active } = get()
    if (!active) return
    const [rawPath] = href.split('#')
    if (!rawPath) return
    try {
      const decoded = decodeURI(rawPath)
      const dir = active.path.includes('/') ? active.path.slice(0, active.path.lastIndexOf('/')) : ''
      const baseParts = dir ? dir.split('/') : []
      const stack = [...baseParts]
      for (const part of decoded.split('/')) {
        if (part === '' || part === '.') continue
        if (part === '..') stack.pop()
        else stack.push(part)
      }
      await get().openFile(active.vaultId, stack.join('/'))
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

  // keeps tabKey accessible to components
}))

export { tabKey }
