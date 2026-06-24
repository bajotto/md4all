# CLAUDE.md — md4all

Contexto completo do projeto para evitar alucinação entre sessões.

## Projeto

**md4all** — Editor Markdown WYSIWYG para desktop (Electron + React + TypeScript).  
Suporta vaults locais, iCloud/SMB e SSH/SFTP remoto.

- `package.json` → versão atual sempre é a fonte da verdade
- Repositório: `https://github.com/bajotto/md4all`
- Idioma do código/comentários: **português brasileiro**

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Electron (main + renderer via electron-vite) |
| UI | React + TypeScript (`.tsx`) |
| Editor WYSIWYG | Milkdown Crepe |
| Editor source | CodeMirror 6 |
| Estado global | Zustand (`useStore`) |
| Estilo | CSS puro (`src/renderer/src/styles/global.css`) |
| SFTP | ssh2-sftp-client |
| Watcher local | chokidar |
| LLM | OpenRouter (configurável pelo usuário) |
| Build/dist | electron-builder |
| CI/CD | GitHub Actions |

---

## Estrutura de arquivos

```
src/
  main/           # processo main do Electron
    index.ts      # entry point
    ipc.ts        # todos os handlers IPC (fonte da verdade da API)
    vault.ts      # operações de arquivo (local e SFTP)
    sftp.ts       # cliente SFTP
    watcher.ts    # FSWatcher chokidar (só vaults locais)
    vaultIndex.ts # índice PKM (wikilinks, tags, backlinks)
    settings.ts   # persistência de configurações
    llm.ts        # cliente OpenRouter
    docAnalysis.ts# análise doc↔código via LLM
    grounding.ts  # verificação de âncoras
    search.ts     # busca full-text
    menu.ts       # menu nativo
    export.ts     # export HTML/PDF
  preload/
    index.ts      # bridge IPC → window.api
  renderer/src/
    App.tsx       # raiz: Splash + Sidebar + Editor/Welcome
    types.ts      # tipos compartilhados do renderer
    store/
      useStore.ts # estado global Zustand (ações e estado)
      treeUtil.ts # helpers imutáveis para árvore de arquivos
    components/
      Logo.tsx           # SVG do logo (usa var(--accent))
      Splash.tsx         # tela de splash (fade 1.3s ao abrir)
      Welcome.tsx        # tela inicial sem arquivo aberto
      InputModal.tsx     # modal genérico de input de texto
      Sidebar/
        FileTree.tsx     # árvore de arquivos (VaultRoot + TreeNode)
        Sidebar.tsx
        Search.tsx
        TagPanel.tsx
        VaultPicker.tsx
      Editor/
        Editor.tsx       # container do editor (WYSIWYG + source)
        MilkdownCrepe.tsx
        CodeMirrorSource.tsx
        Toolbar.tsx
        FormatToolbar.tsx
        FindBar.tsx
      Outline/
        Outline.tsx
        Backlinks.tsx
      Tabs/
        Tabs.tsx
      DocAnalysis/       # análise de documentação por LLM
        DocAnalysisModal.tsx
        AuditView.tsx
        AgentsView.tsx
        RewriteView.tsx
    styles/
      global.css         # único arquivo CSS, variáveis de tema aqui
```

---

## Tipos principais

### `Vault`
```ts
{ id: string; name: string; kind: 'local' | 'sftp'; path: string; sftp?: SftpConfig }
```

### `FileNode`
```ts
{ name: string; path: string; isDir: boolean; children?: FileNode[]; hasMd?: boolean }
// path é SEMPRE relativo à raiz do vault, separador "/"
// hasMd: diretório tem .md em algum descendente → fica azul na árvore
```

### `OpenTab`
```ts
{ vaultId: string; path: string; name: string; content: string; dirty: boolean;
  modifiedAt?: number; stale?: boolean }
// modifiedAt: timestamp quando o arquivo foi lido (para detectar mudança externa)
// stale: true se arquivo mudou no disco desde que foi lido
```

### `AppSettings`
```ts
{ vaults: Vault[]; activeVaultId: string | null; theme: 'light' | 'dark'; llm?: LlmConfig }
```

---

## Estado global (`useStore`)

Estado relevante:
- `vaults` — lista de vaults configurados
- `trees` — `Record<vaultId, FileNode[]>` — árvore por vault
- `tabs` — abas abertas
- `active` — `{ vaultId, path }` da aba ativa
- `clipboard` — `{ vaultId, path }` para copiar/colar arquivos
- `expanded` — `Record<vaultId, boolean>` — vault expandido na sidebar
- `editorMode` — `'wysiwyg' | 'source'`

Ações importantes:
- `openFile(vaultId, relPath)` — usa `readMeta` (retorna content + modifiedAt)
- `refreshTree(vaultId)` — recarrega árvore se vault expandido
- `renamePath(vaultId, from, to)` — renomeia + atualiza tabs + refreshTree
- `copyPath / pastePath` — copiar/colar arquivo (lê conteúdo e escreve no destino)
- `checkFileStale` — compara modifiedAt para detectar mudança externa
- `setHasMdAt` (treeUtil) — marca pasta como tendo .md imediatamente (evita lag visual)

---

## IPC (window.api)

Toda comunicação renderer→main é via `window.api` (definido em `preload/index.ts`).  
**Nunca usar `ipcRenderer` diretamente no renderer.**

Métodos relevantes:
- `api.read(vaultId, relPath)` → `string`
- `api.readMeta(vaultId, relPath)` → `{ content: string; modifiedAt: number }`
- `api.write(vaultId, relPath, content)`
- `api.createFile / createFolder / rename / remove`
- `api.tree(vaultId)` → `FileNode[]` (local, recursivo)
- `api.listDir(vaultId, relPath)` → `FileNode[]` (um nível, usado em SFTP)
- `api.hasMarkdown(vaultId, relPath)` → `boolean`
- `api.onFsEvent(cb)` → unsubscribe fn (eventos do chokidar)

---

## Temas CSS

Variáveis em `:root` (light) e `:root[data-theme='dark']`:
```css
--bg, --bg-elev, --bg-side   /* fundos */
--border                      /* bordas */
--text, --text-soft           /* texto */
--accent, --accent-soft       /* azul de destaque */
--danger                      /* vermelho */
--hover                       /* hover overlay */
```

Nunca usar cores hardcoded — sempre `var(--...)`.

---

## Comportamento de vaults

### Local
- FSWatcher (chokidar) detecta mudanças em tempo real
- Árvore carregada completa (`api.tree`)
- Eventos `vault:fs-event` chegam via IPC → App.tsx os escuta e chama `refreshTree`

### SFTP
- **Sem watcher** — mudanças externas não são detectadas automaticamente
- Árvore lazy: raiz carrega ao expandir, subpastas ao clicar
- Sondagem `hasMd` enfileirada em série (conexão não é reentrante)
- Botão ⟳ no vault header força refresh manual
- Ao trocar de aba: `checkFileStale` verifica se o arquivo mudou

---

## Cor azul nos arquivos/pastas

- Arquivos `.md` ficam azuis: `MD_RE = /\.(md|markdown|mdown|mkd)$/i`
- Pastas ficam azuis se `subtreeHasMd(node)` retorna true (verifica recursivamente `hasMd` e filhos carregados)
- Ao criar/renomear `.md`: `setHasMdAt` marca imediatamente (antes do `refreshTree`)

---

## Release

**Processo** (sempre que pedir nova release):
1. Editar `package.json` → bump de versão
2. `git add package.json && git commit -m "chore: vX.Y.Z"`
3. `git tag vX.Y.Z && git push origin main vX.Y.Z`

**Workflow CI** (`.github/workflows/build-dmg.yml`):
- Dispara em push de tag `v*`
- Job `cleanup`: deleta todas as releases anteriores + todos os artifacts
- Job `build`: matrix mac/win/linux → `softprops/action-gh-release` faz upload direto para release (sem artifacts intermediários)
- **Não usar artifacts** — foi o que causava quota storage esgotada

Outros workflows:
- `cleanup-artifacts.yml` — roda diariamente via cron, deleta artifacts via API
- `doccheck.yml` — valida referências de documentação no pre-commit e CI

---

## Ícones

- Fonte: `build/icon.svg` (M geométrico em rounded square, cor `#3b7dd8`)
- PNGs gerados com ImageMagick: `convert -background none -resize NxN icon.svg icon_N.png`
- `.icns` gerado com `png2icns`
- Tamanhos: 16, 32, 48, 64, 128, 256, 512, 1024

---

## Scripts npm

```bash
npm run dev          # electron-vite dev (requer display)
npm run build        # build produção
npm run typecheck    # tsc sem emitir (ambos tsconfig)
npm test             # vitest run
npm run doccheck     # valida referências de documentação
```

---

## Convenções

- Comentários e mensagens de commit em **português**
- Caminhos de arquivo dentro do vault sempre com `/` (não `path.sep`)
- Nenhum acesso direto ao filesystem no renderer — sempre via `window.api`
- `refreshTree` só age se vault estiver expandido (evita carga desnecessária)
- Estado imutável: sempre `{ ...get().trees, [vaultId]: novaArvore }`
- `InputModal` rejeita nomes com `/` (validação frontend)
- Botão direito em arquivo/pasta na sidebar copia o path absoluto para clipboard
- Autosave: 600ms após última mudança no editor
