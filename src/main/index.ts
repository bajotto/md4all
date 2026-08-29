import { app, BrowserWindow, protocol, net } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'
import { getVault, isSftp, readAssetBinary, resolveInVault } from './vault'

const PROTOCOL = 'md4all-asset'

// The scheme must be registered as privileged before the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// On a remote/headless Linux session (xrdp, VNC, containers without a GPU)
// Electron's GPU compositor cannot produce a first frame, so the window stays
// hidden forever ("installs but doesn't open"). Disable hardware acceleration
// in that case; it has no effect on mac/win or a normal Linux desktop with a
// real GPU. Software rasterization still works (we only disable the GPU path).
function isRemoteLinuxSession(): boolean {
  if (process.platform !== 'linux') return false
  // xrdp sets XDG_SESSION_TYPE=xrdp-x11 / SESSION_TYPE=xrdp.
  const sessionType = (process.env.XDG_SESSION_TYPE ?? process.env.SESSION_TYPE ?? '').toLowerCase()
  if (sessionType.includes('xrdp')) return true
  // No DRI render node => no usable GPU in this session (covers VNC/headless).
  return !existsSync('/dev/dri/renderD128')
}

if (isRemoteLinuxSession()) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'md4all',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Safety net: if ready-to-show never fires (e.g. GPU compositor stall on a
  // remote session), show the window anyway so the app never appears "dead".
  const showTimer = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }, 3000)

  win.once('ready-to-show', () => {
    clearTimeout(showTimer)
    win.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Serves vault images: md4all-asset://<vaultId>/<relative-path>
 * The URL host is the vaultId; the rest is resolved with protection against
 * path traversal by resolveInVault.
 */
function registerAssetProtocol(): void {
  protocol.handle(PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const vaultId = url.hostname
      const relPath = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '')
      const vault = getVault(vaultId)
      if (isSftp(vault)) {
        // downloads the remote bytes and returns them as a response
        const buf = await readAssetBinary(vaultId, relPath)
        return new Response(new Uint8Array(buf))
      }
      const abs = resolveInVault(vaultId, relPath)
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

app.whenReady().then(() => {
  registerAssetProtocol()
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
