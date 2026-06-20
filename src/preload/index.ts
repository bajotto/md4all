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

  // arquivos
  tree: (vaultId: string) => ipcRenderer.invoke('file:tree', vaultId),
  read: (vaultId: string, relPath: string) => ipcRenderer.invoke('file:read', vaultId, relPath),
  write: (vaultId: string, relPath: string, content: string) =>
    ipcRenderer.invoke('file:write', vaultId, relPath, content),
  createFile: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('file:create', vaultId, relPath),
  createFolder: (vaultId: string, relPath: string) =>
    ipcRenderer.invoke('file:createFolder', vaultId, relPath),
  rename: (vaultId: string, from: string, to: string) =>
    ipcRenderer.invoke('file:rename', vaultId, from, to),
  remove: (vaultId: string, relPath: string) => ipcRenderer.invoke('file:remove', vaultId, relPath),

  // imagens
  saveAsset: (vaultId: string, fileName: string, data: Uint8Array) =>
    ipcRenderer.invoke('asset:save', vaultId, fileName, data),

  // busca
  search: (vaultId: string, query: string) => ipcRenderer.invoke('search:run', vaultId, query),

  // dialogs nativos
  confirm: (message: string) => ipcRenderer.invoke('dialog:confirm', message),
  showError: (message: string) => ipcRenderer.invoke('dialog:error', message),

  // export
  exportHtml: (vaultId: string, relPath: string, markdown: string) =>
    ipcRenderer.invoke('export:html', vaultId, relPath, markdown),
  exportPdf: (vaultId: string, relPath: string, markdown: string) =>
    ipcRenderer.invoke('export:pdf', vaultId, relPath, markdown),

  // eventos de filesystem externos
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
