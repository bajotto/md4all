import { dialog, ipcMain } from 'electron'
import path from 'path'
import { getSettings, setSettings } from './settings'
import { exportHtml, exportPdf } from './export'
import { search } from './search'
import { watchVault } from './watcher'
import {
  addVault,
  createFile,
  createFolder,
  listTree,
  readFile,
  remove,
  removeVault,
  rename,
  saveAsset,
  writeFile
} from './vault'
import type { AppSettings } from './types'

export function registerIpc(): void {
  // ---- settings ----
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => setSettings(patch))

  // ---- vaults ----
  ipcMain.handle('vault:add', (_e, name: string, vaultPath: string) => addVault(name, vaultPath))
  ipcMain.handle('vault:remove', (_e, vaultId: string) => removeVault(vaultId))
  ipcMain.handle('vault:watch', (_e, vaultId: string) => watchVault(vaultId))
  ipcMain.handle('vault:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    return { path: folder, name: path.basename(folder) }
  })

  // ---- arquivos ----
  ipcMain.handle('file:tree', (_e, vaultId: string) => listTree(vaultId))
  ipcMain.handle('file:read', (_e, vaultId: string, relPath: string) => readFile(vaultId, relPath))
  ipcMain.handle('file:write', (_e, vaultId: string, relPath: string, content: string) =>
    writeFile(vaultId, relPath, content)
  )
  ipcMain.handle('file:create', (_e, vaultId: string, relPath: string) =>
    createFile(vaultId, relPath)
  )
  ipcMain.handle('file:createFolder', (_e, vaultId: string, relPath: string) =>
    createFolder(vaultId, relPath)
  )
  ipcMain.handle('file:rename', (_e, vaultId: string, from: string, to: string) =>
    rename(vaultId, from, to)
  )
  ipcMain.handle('file:remove', (_e, vaultId: string, relPath: string) => remove(vaultId, relPath))

  // ---- imagens / assets ----
  ipcMain.handle('asset:save', (_e, vaultId: string, fileName: string, data: Uint8Array) =>
    saveAsset(vaultId, fileName, new Uint8Array(data))
  )

  // ---- busca ----
  ipcMain.handle('search:run', (_e, vaultId: string, query: string) => search(vaultId, query))

  // ---- export ----
  ipcMain.handle('export:html', (_e, vaultId: string, relPath: string, markdown: string) =>
    exportHtml(vaultId, relPath, markdown)
  )
  ipcMain.handle('export:pdf', (_e, vaultId: string, relPath: string, markdown: string) =>
    exportPdf(vaultId, relPath, markdown)
  )
}
