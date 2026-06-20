import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { getVault, isSftp } from './vault'

// um watcher por vault local (multi-raiz)
const watchers = new Map<string, FSWatcher>()

function emit(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/** Observa a raiz de um vault local e emite eventos de mudança para o renderer.
 *  Vaults SFTP não são observados (sem watch remoto). */
export function watchVault(vaultId: string): void {
  if (watchers.has(vaultId)) return
  const vault = getVault(vaultId)
  if (isSftp(vault)) return

  const root = path.resolve(vault.path)
  const watcher = chokidar.watch(root, {
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
  watchers.set(vaultId, watcher)
}

export function unwatchVault(vaultId: string): void {
  const w = watchers.get(vaultId)
  if (w) {
    void w.close()
    watchers.delete(vaultId)
  }
}

export function stopWatching(): void {
  for (const w of watchers.values()) void w.close()
  watchers.clear()
}
