# md4all

Editor Markdown WYSIWYG completo para desktop (Electron), no estilo Obsidian/Typora.
Grava em qualquer pasta configurável — **disco local, iCloud Drive ou share SMB montado**.

## Instalação

### macOS

O app é assinado ad-hoc (sem Apple Developer ID / notarização), então o Gatekeeper
bloqueia o download com "damaged and can't be opened". O instalador abaixo baixa o
DMG da release mais recente, copia para `/Applications` e remove a quarentena
automaticamente — **sem precisar rodar `xattr -cr` manualmente**:

```bash
curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash
```

Para uma versão específica:

```bash
curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash -s -- v0.11.5
```

> Alternativa manual: baixe o `.dmg` em [Releases](https://github.com/bajotto/md4all/releases),
> copie o app para `/Applications` e rode `xattr -cr /Applications/md4all.app`.

### Linux / Windows

Baixe o instalador em [Releases](https://github.com/bajotto/md4all/releases)
(`.AppImage`/`.deb` para Linux, `.exe` para Windows).

## Recursos

- **WYSIWYG inline** (Milkdown Crepe): a sintaxe é escondida e o conteúdo renderiza no lugar.
- **Toggle WYSIWYG ↔ Código** (CodeMirror 6) para editar o markdown cru.
- **Imagens**: render no editor + colar/arrastar → salvas em `<vault>/assets/` com caminho
  relativo portável. Servidas via protocolo interno `md4all-asset://`.
- **Tabelas GFM** editáveis, blocos de código com syntax highlighting, listas de tarefas.
- **Vault** = pasta. Vários vaults configuráveis; cada um aponta para qualquer caminho
  (local, iCloud, SMB montado).
- **Sidebar** com árvore de arquivos (criar/renomear/apagar), **abas**, **busca full-text**.
- **Auto-save** com debounce + `Ctrl/Cmd+S`; detecção de mudanças externas (chokidar) com
  recarga automática quando o arquivo aberto não tem edições pendentes.
- **Export PDF e HTML** (markdown-it + highlight.js), com imagens embutidas como data-URI
  para um arquivo portável. PDF gerado via `printToPDF` do Electron.
- **Tema** claro/escuro.

## Arquitetura

- `src/main/` — processo principal: I/O de filesystem (`vault.ts`), watcher (`watcher.ts`),
  busca (`search.ts`), settings (`settings.ts`, via electron-store), handlers IPC (`ipc.ts`)
  e o protocolo de imagens (`index.ts`). Toda escrita é validada contra path traversal.
- `src/preload/` — `contextBridge` expõe uma API segura (`window.api`); sem `nodeIntegration`.
- `src/renderer/` — React + Zustand. Editor em `components/Editor/` (Crepe/CodeMirror + toggle),
  sidebar em `components/Sidebar/`, abas em `components/Tabs/`.

## Desenvolvimento

```bash
npm install
npm run dev        # abre a janela com HMR
npm run typecheck  # checagem de tipos
npm run build      # bundles em out/
```

### Empacotar

```bash
npm run build:linux   # ou build:mac / build:win (electron-builder)
```

## Armazenamento (local / iCloud / SMB)

O app não fala protocolos de nuvem diretamente: ele lê/escreve em um **caminho de pasta**.
Basta apontar o vault para a pasta certa:

- **Local**: qualquer diretório.
- **iCloud (macOS)**: pasta dentro de `~/Library/Mobile Documents/...`.
- **SMB**: share já montado pelo SO (`/Volumes/...` no macOS, `/mnt/...` no Linux,
  `\\host\share` no Windows). A sincronização fica a cargo do SO/serviço.

## Observações conhecidas

- Ao salvar imagens, o Milkdown Crepe pode reescrever o texto-alt (`![alt]`) da imagem.
  O caminho do arquivo é preservado como relativo.
