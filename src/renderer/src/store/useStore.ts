import { create } from 'zustand'
import type { AppSettings, EditorMode, FileNode, OpenTab, SearchHit, Vault } from '../types'

const api = window.api

interface State {
  // config
  vaults: Vault[]
  activeVaultId: string | null
  theme: 'light' | 'dark'

  // navegação
  tree: FileNode[]
  tabs: OpenTab[]
  activePath: string | null
  editorMode: EditorMode

  // busca
  searchQuery: string
  searchResults: SearchHit[]
  searching: boolean

  // ações de bootstrap / config
  init: () => Promise<void>
  setActiveVault: (vaultId: string) => Promise<void>
  refreshTree: () => Promise<void>
  addVaultFromPicker: () => Promise<void>
  removeVault: (vaultId: string) => Promise<void>
  toggleTheme: () => Promise<void>

  // ações de arquivos
  openFile: (relPath: string) => Promise<void>
  closeTab: (relPath: string) => void
  setActiveTab: (relPath: string) => void
  updateContent: (relPath: string, content: string) => void
  saveTab: (relPath: string) => Promise<void>
  createFile: (relPath: string) => Promise<void>
  createFolder: (relPath: string) => Promise<void>
  renamePath: (from: string, to: string) => Promise<void>
  deletePath: (relPath: string) => Promise<void>
  reloadTabFromDisk: (relPath: string) => Promise<void>

  // editor
  setEditorMode: (mode: EditorMode) => void

  // busca
  runSearch: (query: string) => Promise<void>
  clearSearch: () => void

  // export
  exportActive: (format: 'html' | 'pdf') => Promise<string | null>

  // helpers internos
  applySettings: (s: AppSettings) => void
}

function basename(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1]
}

export const useStore = create<State>((set, get) => ({
  vaults: [],
  activeVaultId: null,
  theme: 'light',
  tree: [],
  tabs: [],
  activePath: null,
  editorMode: 'wysiwyg',
  searchQuery: '',
  searchResults: [],
  searching: false,

  applySettings: (s) => {
    set({ vaults: s.vaults, activeVaultId: s.activeVaultId, theme: s.theme })
    document.documentElement.dataset.theme = s.theme
  },

  init: async () => {
    const s = (await api.getSettings()) as AppSettings
    get().applySettings(s)
    if (s.activeVaultId) {
      await api.watchVault(s.activeVaultId)
      await get().refreshTree()
    }
  },

  setActiveVault: async (vaultId) => {
    const s = (await api.setSettings({ activeVaultId: vaultId })) as AppSettings
    get().applySettings(s)
    set({ tabs: [], activePath: null, searchResults: [], searchQuery: '' })
    await api.watchVault(vaultId)
    await get().refreshTree()
  },

  refreshTree: async () => {
    const { activeVaultId } = get()
    if (!activeVaultId) {
      set({ tree: [] })
      return
    }
    const tree = (await api.tree(activeVaultId)) as FileNode[]
    set({ tree })
  },

  addVaultFromPicker: async () => {
    const picked = (await api.pickFolder()) as { path: string; name: string } | null
    if (!picked) return
    const vault = (await api.addVault(picked.name, picked.path)) as Vault
    const s = (await api.getSettings()) as AppSettings
    get().applySettings(s)
    await get().setActiveVault(vault.id)
  },

  removeVault: async (vaultId) => {
    await api.removeVault(vaultId)
    const s = (await api.getSettings()) as AppSettings
    get().applySettings(s)
    if (s.activeVaultId) {
      await api.watchVault(s.activeVaultId)
      await get().refreshTree()
    } else {
      set({ tree: [], tabs: [], activePath: null })
    }
  },

  toggleTheme: async () => {
    const theme = get().theme === 'light' ? 'dark' : 'light'
    const s = (await api.setSettings({ theme })) as AppSettings
    get().applySettings(s)
  },

  openFile: async (relPath) => {
    const { activeVaultId, tabs } = get()
    if (!activeVaultId) return
    const existing = tabs.find((t) => t.path === relPath)
    if (existing) {
      set({ activePath: relPath })
      return
    }
    const content = (await api.read(activeVaultId, relPath)) as string
    const tab: OpenTab = { path: relPath, name: basename(relPath), content, dirty: false }
    set({ tabs: [...tabs, tab], activePath: relPath })
  },

  closeTab: (relPath) => {
    const { tabs, activePath } = get()
    const idx = tabs.findIndex((t) => t.path === relPath)
    if (idx === -1) return
    const next = tabs.filter((t) => t.path !== relPath)
    let nextActive = activePath
    if (activePath === relPath) {
      nextActive = next[idx]?.path ?? next[idx - 1]?.path ?? null
    }
    set({ tabs: next, activePath: nextActive })
  },

  setActiveTab: (relPath) => set({ activePath: relPath }),

  updateContent: (relPath, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.path === relPath ? { ...t, content, dirty: true } : t
      )
    })
  },

  saveTab: async (relPath) => {
    const { activeVaultId, tabs } = get()
    if (!activeVaultId) return
    const tab = tabs.find((t) => t.path === relPath)
    if (!tab || !tab.dirty) return
    await api.write(activeVaultId, relPath, tab.content)
    set({ tabs: get().tabs.map((t) => (t.path === relPath ? { ...t, dirty: false } : t)) })
  },

  createFile: async (relPath) => {
    const { activeVaultId } = get()
    if (!activeVaultId) return
    const finalPath = relPath.endsWith('.md') ? relPath : `${relPath}.md`
    await api.createFile(activeVaultId, finalPath)
    await get().refreshTree()
    await get().openFile(finalPath)
  },

  createFolder: async (relPath) => {
    const { activeVaultId } = get()
    if (!activeVaultId) return
    await api.createFolder(activeVaultId, relPath)
    await get().refreshTree()
  },

  renamePath: async (from, to) => {
    const { activeVaultId } = get()
    if (!activeVaultId) return
    await api.rename(activeVaultId, from, to)
    set({
      tabs: get().tabs.map((t) =>
        t.path === from ? { ...t, path: to, name: basename(to) } : t
      ),
      activePath: get().activePath === from ? to : get().activePath
    })
    await get().refreshTree()
  },

  deletePath: async (relPath) => {
    const { activeVaultId } = get()
    if (!activeVaultId) return
    await api.remove(activeVaultId, relPath)
    // fecha abas dentro do caminho removido
    const affected = get().tabs.filter(
      (t) => t.path === relPath || t.path.startsWith(relPath + '/')
    )
    for (const t of affected) get().closeTab(t.path)
    await get().refreshTree()
  },

  reloadTabFromDisk: async (relPath) => {
    const { activeVaultId, tabs } = get()
    if (!activeVaultId) return
    const tab = tabs.find((t) => t.path === relPath)
    if (!tab || tab.dirty) return // não sobrescreve edição não salva
    try {
      const content = (await api.read(activeVaultId, relPath)) as string
      set({
        tabs: get().tabs.map((t) => (t.path === relPath ? { ...t, content, dirty: false } : t))
      })
    } catch {
      // arquivo pode ter sumido; ignora
    }
  },

  setEditorMode: (mode) => set({ editorMode: mode }),

  runSearch: async (query) => {
    const { activeVaultId } = get()
    set({ searchQuery: query })
    if (!activeVaultId || !query.trim()) {
      set({ searchResults: [], searching: false })
      return
    }
    set({ searching: true })
    const results = (await api.search(activeVaultId, query)) as SearchHit[]
    set({ searchResults: results, searching: false })
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [] }),

  exportActive: async (format) => {
    const { activeVaultId, activePath, tabs } = get()
    if (!activeVaultId || !activePath) return null
    const tab = tabs.find((t) => t.path === activePath)
    if (!tab) return null
    // garante que o conteúdo no disco esteja atualizado antes de exportar
    if (tab.dirty) await get().saveTab(activePath)
    const fn = format === 'pdf' ? window.api.exportPdf : window.api.exportHtml
    return (await fn(activeVaultId, activePath, tab.content)) as string | null
  }
}))
