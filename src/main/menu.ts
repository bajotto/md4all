import { app, Menu, BrowserWindow, type MenuItemConstructorOptions } from 'electron'

function sendMenu(cmd: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:command', cmd)
}

/** Monta o menu da aplicação com papéis nativos (copiar/colar/desfazer…) e
 *  os itens de busca que abrem a barra Find/Replace no renderer. */
export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : []),
    { role: 'fileMenu' },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
        { type: 'separator' },
        {
          label: 'Localizar',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendMenu('find')
        },
        {
          label: 'Substituir',
          accelerator: isMac ? 'Alt+Cmd+F' : 'Ctrl+H',
          click: () => sendMenu('replace')
        }
      ]
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' }
      ]
    },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  app.name = 'md4all'
}
