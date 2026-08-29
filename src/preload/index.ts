import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),

  // vaults
  addVault: (name: string, path: string) => ipcRenderer.invoke('vault:add', name, path),
  removeVault: (vaultId: string) => ipcRenderer.invoke('vault:remove', vaultId),
  watchVault: (vaultId: string) => ipcRenderer.invoke('vault:watch', vaultId),
  pickFolder: () => ipcRenderer.invoke('vault:pickFolder'),
  icloudPath: () => ipcRenderer.invoke('vault:icloudPath'),
  unwatchVault: (vaultId: string) => ipcRenderer.invoke('vault:unwatch', vaultId),

  // SFTP / SSH
  addSftp: (input: unknown) => ipcRenderer.invoke('vault:addSftp', input),
  testSftp: (input: unknown) => ipcRenderer.invoke('vault:testSftp', input),
  browseSftp: (input: unknown, remotePath?: string) =>
    ipcRenderer.invoke('vault:browseSftp', input, remotePath),
  browseSftpClose: () => ipcRenderer.invoke('vault:browseClose'),
  pickKey: () => ipcRenderer.invoke('vault:pickKey'),

  // files
  tree: (vaultId: string) => ipcRenderer.invoke('file:tree', vaultId),
  listDir: (vaultId: string, relPath: string) => ipcRenderer.invoke('file:listDir', vaultId, relPath),
  hasMarkdown: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('file:hasMarkdown', vaultId, relPath),
  read: (vaultId: string, relPath: string) => ipcRenderer.invoke('file:read', vaultId, relPath),
  readMeta: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('file:readMeta', vaultId, relPath),
  write: (vaultId: string, relPath: string, content: string) =>
    ipcRenderer.invoke('file:write', vaultId, relPath, content),
  createFile: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('file:create', vaultId, relPath),
  createFolder: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('file:createFolder', vaultId, relPath),
  rename: (vaultId: string, from: string, to: string) =>
    ipcRenderer.invoke('file:rename', vaultId, from, to),
  remove: (vaultId: string, relPath: string) => ipcRenderer.invoke('file:remove', vaultId, relPath),

  // images
  saveAsset: (vaultId: string, fileName: string, data: Uint8Array) =>
    ipcRenderer.invoke('asset:save', vaultId, fileName, data),

  // search
  search: (vaultId: string, query: string) => ipcRenderer.invoke('search:run', vaultId, query),
  aiSearch: (vaultId: string, query: string) => ipcRenderer.invoke('search:ai', vaultId, query),
  onAiSearchProgress: (cb: (payload: { msg: string; pct?: number }) => void) => {
    const listener = (_e: unknown, payload: { msg: string; pct?: number }): void => cb(payload)
    ipcRenderer.on('search:ai-progress', listener)
    return () => {
      ipcRenderer.removeListener('search:ai-progress', listener)
    }
  },

  // index (wikilinks / tags / backlinks)
  indexBuild: (vaultId: string) => ipcRenderer.invoke('index:build', vaultId),
  indexBacklinks: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('index:backlinks', vaultId, relPath),
  indexTags: (vaultId: string) => ipcRenderer.invoke('index:tags', vaultId),
  indexNotesForTag: (vaultId: string, tag: string) =>
    ipcRenderer.invoke('index:notesForTag', vaultId, tag),
  indexResolve: (vaultId: string, target: string) =>
    ipcRenderer.invoke('index:resolve', vaultId, target),
  indexNotes: (vaultId: string) => ipcRenderer.invoke('index:notes', vaultId),

  // native dialogs
  confirm: (message: string) => ipcRenderer.invoke('dialog:confirm', message),
  showError: (message: string) => ipcRenderer.invoke('dialog:error', message),

  // export
  exportHtml: (vaultId: string, relPath: string, markdown: string) =>
    ipcRenderer.invoke('export:html', vaultId, relPath, markdown),
  exportPdf: (vaultId: string, relPath: string, markdown: string) =>
    ipcRenderer.invoke('export:pdf', vaultId, relPath, markdown),

  // LLM (OpenRouter) + documentation analysis
  llmListModels: (token?: string) => ipcRenderer.invoke('llm:listModels', token),
  llmGetConfig: () => ipcRenderer.invoke('llm:getConfig'),
  llmValidate: (input: unknown) => ipcRenderer.invoke('llm:validate', input),
  llmSaveConfig: (input: unknown) => ipcRenderer.invoke('llm:saveConfig', input),
  docAudit: (vaultId: string) => ipcRenderer.invoke('doc:audit', vaultId),
  docAnalyze: (vaultId: string) => ipcRenderer.invoke('doc:analyze', vaultId),
  docReview: (vaultId: string, report: unknown) =>
    ipcRenderer.invoke('doc:review', vaultId, report),
  docApply: (vaultId: string, report: unknown) => ipcRenderer.invoke('doc:apply', vaultId, report),
  docAgents: (vaultId: string, targetPath: string) =>
    ipcRenderer.invoke('doc:agents', vaultId, targetPath),
  docAgentsApply: (vaultId: string, targetPath: string, content: string) =>
    ipcRenderer.invoke('doc:agentsApply', vaultId, targetPath, content),
  docExportAuditPrompt: (vaultId: string) => ipcRenderer.invoke('doc:exportAuditPrompt', vaultId),
  docExportAnalyzePrompt: (vaultId: string) => ipcRenderer.invoke('doc:exportAnalyzePrompt', vaultId),
  docImportAudit: (vaultId: string, rawJson: string) =>
    ipcRenderer.invoke('doc:importAudit', vaultId, rawJson),
  docImportAnalyze: (rawJson: string) => ipcRenderer.invoke('doc:importAnalyze', rawJson),
  onDocProgress: (cb: (payload: { msg: string; pct?: number }) => void) => {
    const listener = (_e: unknown, payload: { msg: string; pct?: number }): void => cb(payload)
    ipcRenderer.on('doc:progress', listener)
    return () => {
      ipcRenderer.removeListener('doc:progress', listener)
    }
  },

  // native menu commands (find/replace)
  onMenu: (cb: (cmd: string) => void) => {
    const listener = (_e: unknown, cmd: string): void => cb(cmd)
    ipcRenderer.on('menu:command', listener)
    return () => {
      ipcRenderer.removeListener('menu:command', listener)
    }
  },

  // external filesystem events
  onFsEvent: (cb: (payload: { type: string; path: string; vaultId: string }) => void) => {
    const listener = (_e: unknown, payload: { type: string; path: string; vaultId: string }) =>
      cb(payload)
    ipcRenderer.on('vault:fs-event', listener)
    return () => {
      ipcRenderer.removeListener('vault:fs-event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
