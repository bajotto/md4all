import { dialog, ipcMain } from 'electron'
import path from 'path'
import { getSettings, setSettings } from './settings'
import { exportHtml, exportPdf } from './export'
import { search } from './search'
import { watchVault } from './watcher'
import {
  addSftpVault,
  addVault,
  createFile,
  createFolder,
  listTree,
  readFile,
  remove,
  removeVault,
  rename,
  saveAsset,
  suggestedIcloudPath,
  testSftp,
  writeFile
} from './vault'
import { unwatchVault } from './watcher'
import {
  allTags,
  backlinksFor,
  buildIndex,
  dropVault,
  listNotes,
  notesForTag,
  removeNote,
  resolveLink,
  touchNote
} from './vaultIndex'
import type { AppSettings, SftpInput } from './types'

export function registerIpc(): void {
  // ---- settings ----
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => setSettings(patch))

  // ---- vaults ----
  ipcMain.handle('vault:add', (_e, name: string, vaultPath: string) => addVault(name, vaultPath))
  ipcMain.handle('vault:remove', (_e, vaultId: string) => {
    dropVault(vaultId)
    return removeVault(vaultId)
  })
  ipcMain.handle('vault:watch', (_e, vaultId: string) => watchVault(vaultId))
  ipcMain.handle('vault:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      message: 'Escolha a pasta do vault (disco local, /Volumes/<share> SMB, ou iCloud)'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    return { path: folder, name: path.basename(folder) }
  })
  ipcMain.handle('vault:icloudPath', () => suggestedIcloudPath())
  ipcMain.handle('vault:addSftp', (_e, input: SftpInput) => addSftpVault(input))
  ipcMain.handle('vault:testSftp', (_e, input: SftpInput) => testSftp(input))
  ipcMain.handle('vault:pickKey', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      message: 'Selecione a chave privada / certificado (ex.: id_rsa, .pem)'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle('vault:unwatch', (_e, vaultId: string) => unwatchVault(vaultId))

  // ---- arquivos ----
  ipcMain.handle('file:tree', (_e, vaultId: string) => listTree(vaultId))
  ipcMain.handle('file:read', (_e, vaultId: string, relPath: string) => readFile(vaultId, relPath))
  ipcMain.handle('file:write', async (_e, vaultId: string, relPath: string, content: string) => {
    await writeFile(vaultId, relPath, content)
    await touchNote(vaultId, relPath)
  })
  ipcMain.handle('file:create', (_e, vaultId: string, relPath: string) =>
    createFile(vaultId, relPath)
  )
  ipcMain.handle('file:createFolder', (_e, vaultId: string, relPath: string) =>
    createFolder(vaultId, relPath)
  )
  ipcMain.handle('file:rename', (_e, vaultId: string, from: string, to: string) =>
    rename(vaultId, from, to)
  )
  ipcMain.handle('file:remove', async (_e, vaultId: string, relPath: string) => {
    await remove(vaultId, relPath)
    removeNote(vaultId, relPath)
  })

  // ---- índice (wikilinks / tags / backlinks) ----
  ipcMain.handle('index:build', (_e, vaultId: string) => buildIndex(vaultId))
  ipcMain.handle('index:backlinks', (_e, vaultId: string, relPath: string) =>
    backlinksFor(vaultId, relPath)
  )
  ipcMain.handle('index:tags', (_e, vaultId: string) => allTags(vaultId))
  ipcMain.handle('index:notesForTag', (_e, vaultId: string, tag: string) =>
    notesForTag(vaultId, tag)
  )
  ipcMain.handle('index:resolve', (_e, vaultId: string, target: string) =>
    resolveLink(vaultId, target)
  )
  ipcMain.handle('index:notes', (_e, vaultId: string) => listNotes(vaultId))

  // ---- imagens / assets ----
  ipcMain.handle('asset:save', (_e, vaultId: string, fileName: string, data: Uint8Array) =>
    saveAsset(vaultId, fileName, new Uint8Array(data))
  )

  // ---- busca ----
  ipcMain.handle('search:run', (_e, vaultId: string, query: string) => search(vaultId, query))

  // ---- dialogs nativos ----
  ipcMain.handle('dialog:confirm', async (_e, message: string) => {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancelar', 'OK'],
      defaultId: 1,
      cancelId: 0,
      message
    })
    return result.response === 1
  })
  ipcMain.handle('dialog:error', async (_e, message: string) => {
    await dialog.showErrorBox('Erro', message)
  })

  // ---- export ----
  ipcMain.handle('export:html', (_e, vaultId: string, relPath: string, markdown: string) =>
    exportHtml(vaultId, relPath, markdown)
  )
  ipcMain.handle('export:pdf', (_e, vaultId: string, relPath: string, markdown: string) =>
    exportPdf(vaultId, relPath, markdown)
  )
}
