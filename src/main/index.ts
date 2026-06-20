import { app, BrowserWindow, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { getVault, isSftp, readAssetBinary, resolveInVault } from './vault'

const PROTOCOL = 'md4all-asset'

// O esquema precisa ser registrado como privilegiado antes do app ficar pronto
protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

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

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Serve imagens do vault: md4all-asset://<vaultId>/<caminho-relativo>
 * O host da URL é o vaultId; o restante é resolvido com proteção contra
 * path traversal por resolveInVault.
 */
function registerAssetProtocol(): void {
  protocol.handle(PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const vaultId = url.hostname
      const relPath = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '')
      const vault = getVault(vaultId)
      if (isSftp(vault)) {
        // baixa os bytes remotos e devolve como resposta
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
