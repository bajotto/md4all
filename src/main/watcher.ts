import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { getVault } from './vault'

let watcher: FSWatcher | null = null
let watchedVaultId: string | null = null

function emit(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/** Observa a raiz de um vault e emite eventos de mudança para o renderer. */
export function watchVault(vaultId: string): void {
  if (watchedVaultId === vaultId && watcher) return
  stopWatching()

  const vault = getVault(vaultId)
  const root = path.resolve(vault.path)
  watchedVaultId = vaultId

  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignored: (p) => /(^|[/\\])(\.|node_modules)/.test(p),
    depth: 20,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })

  const rel = (abs: string): string => path.relative(root, abs).split(path.sep).join('/')

  watcher
    .on('add', (p) => emit('vault:fs-event', { type: 'add', path: rel(p), vaultId }))
    .on('change', (p) => emit('vault:fs-event', { type: 'change', path: rel(p), vaultId }))
    .on('unlink', (p) => emit('vault:fs-event', { type: 'unlink', path: rel(p), vaultId }))
    .on('addDir', (p) => emit('vault:fs-event', { type: 'addDir', path: rel(p), vaultId }))
    .on('unlinkDir', (p) => emit('vault:fs-event', { type: 'unlinkDir', path: rel(p), vaultId }))
}

export function stopWatching(): void {
  if (watcher) {
    void watcher.close()
    watcher = null
  }
  watchedVaultId = null
}
