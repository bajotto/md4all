# CLAUDE.md — md4all

Complete project context to prevent hallucination between sessions.

## Project

**md4all** — WYSIWYG Markdown editor for desktop (Electron + React + TypeScript).  
Supports local vaults, iCloud/SMB and remote SSH/SFTP.

- `package.json` → current version is always the source of truth
- Repository: `https://github.com/bajatto/md4all`
- Code/comment language: **English**

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Electron (main + renderer via electron-vite) |
| UI | React + TypeScript (`.tsx`) |
| WYSIWYG editor | Milkdown Crepe |
| Source editor | CodeMirror 6 |
| Global state | Zustand (`useStore`) |
| Styling | Plain CSS (`src/renderer/src/styles/global.css`) |
| SFTP | ssh2-sftp-client |
| Local watcher | chokidar |
| LLM | OpenRouter (user-configurable) |
| Build/dist | electron-builder |
| CI/CD | GitHub Actions |

---

## File structure

```
src/
  main/           # Electron main process
    index.ts      # entry point
    ipc.ts        # all IPC handlers (source of truth for the API)
    vault.ts      # file operations (local and SFTP)
    sftp.ts       # SFTP client
    watcher.ts    # chokidar FSWatcher (local vaults only)
    vaultIndex.ts # PKM index (wikilinks, tags, backlinks)
    settings.ts   # settings persistence
    llm.ts        # OpenRouter client
    docAnalysis.ts# doc↔code analysis via LLM
    grounding.ts  # anchor verification
    search.ts     # full-text search
    menu.ts       # native menu
    export.ts     # HTML/PDF export
  preload/
    index.ts      # IPC bridge → window.api
  renderer/src/
    App.tsx       # root: Splash + Sidebar + Editor/Welcome
    types.ts      # shared renderer types
    store/
      useStore.ts # Zustand global state (actions and state)
      treeUtil.ts # immutable helpers for the file tree
    components/
      Logo.tsx           # logo SVG (uses var(--accent))
      Splash.tsx         # splash screen (1.3s fade on open)
      Welcome.tsx        # welcome screen with no file open
      InputModal.tsx     # generic text input modal
      Sidebar/
        FileTree.tsx     # file tree (VaultRoot + TreeNode)
        Sidebar.tsx
        Search.tsx
        TagPanel.tsx
        VaultPicker.tsx
      Editor/
        Editor.tsx       # editor container (WYSIWYG + source)
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
      DocAnalysis/       # LLM documentation analysis
        DocAnalysisModal.tsx
        AuditView.tsx
        AgentsView.tsx
        RewriteView.tsx
    styles/
      global.css         # single CSS file, theme variables here
```

---

## Main types

### `Vault`
```ts
{ id: string; name: string; kind: 'local' | 'sftp'; path: string; sftp?: SftpConfig }
```

### `FileNode`
```ts
{ name: string; path: string; isDir: boolean; children?: FileNode[]; hasMd?: boolean }
// path is ALWAYS relative to the vault root, separator "/"
// hasMd: directory has .md in some descendant → turns blue in the tree
```

### `OpenTab`
```ts
{ vaultId: string; path: string; name: string; content: string; dirty: boolean;
  modifiedAt?: number; stale?: boolean }
// modifiedAt: timestamp when the file was read (to detect external changes)
// stale: true if the file changed on disk since it was read
```

### `AppSettings`
```ts
{ vaults: Vault[]; activeVaultId: string | null; theme: 'light' | 'dark'; llm?: LlmConfig }
```

---

## Global state (`useStore`)

Relevant state:
- `vaults` — list of configured vaults
- `trees` — `Record<vaultId, FileNode[]>` — tree per vault
- `tabs` — open tabs
- `active` — `{ vaultId, path }` of the active tab
- `clipboard` — `{ vaultId, path }` for copy/paste of files
- `expanded` — `Record<vaultId, boolean>` — vault expanded in the sidebar
- `editorMode` — `'wysiwyg' | 'source'`

Important actions:
- `openFile(vaultId, relPath)` — uses `readMeta` (returns content + modifiedAt)
- `refreshTree(vaultId)` — reloads tree if vault is expanded
- `renamePath(vaultId, from, to)` — renames + updates tabs + refreshTree
- `copyPath / pastePath` — copy/paste file (reads content and writes to destination)
- `checkFileStale` — compares modifiedAt to detect external changes
- `setHasMdAt` (treeUtil) — marks folder as having .md immediately (avoids visual lag)

---

## IPC (window.api)

All renderer→main communication is via `window.api` (defined in `preload/index.ts`).  
**Never use `ipcRenderer` directly in the renderer.**

Relevant methods:
- `api.read(vaultId, relPath)` → `string`
- `api.readMeta(vaultId, relPath)` → `{ content: string; modifiedAt: number }`
- `api.write(vaultId, relPath, content)`
- `api.createFile / createFolder / rename / remove`
- `api.tree(vaultId)` → `FileNode[]` (local, recursive)
- `api.listDir(vaultId, relPath)` → `FileNode[]` (one level, used in SFTP)
- `api.hasMarkdown(vaultId, relPath)` → `boolean`
- `api.onFsEvent(cb)` → unsubscribe fn (chokidar events)

---

## CSS themes

Variables in `:root` (light) and `:root[data-theme='dark']`:
```css
--bg, --bg-elev, --bg-side   /* backgrounds */
--border                      /* borders */
--text, --text-soft           /* text */
--accent, --accent-soft       /* highlight blue */
--danger                      /* red */
--hover                       /* hover overlay */
```

Never use hardcoded colors — always `var(--...)`.

---

## Vault behavior

### Local
- FSWatcher (chokidar) detects changes in real time
- Full tree loaded (`api.tree`)
- `vault:fs-event` events arrive via IPC → App.tsx listens and calls `refreshTree`

### SFTP
- **No watcher** — external changes are not detected automatically
- Lazy tree: root loads on expand, subfolders on click
- `hasMd` probing queued serially (connection is not reentrant)
- ⟳ button in the vault header forces a manual refresh
- On tab switch: `checkFileStale` checks whether the file changed

---

## Blue color in files/folders

- `.md` files turn blue: `MD_RE = /\.(md|markdown|mdown|mkd)$/i`
- Folders turn blue if `subtreeHasMd(node)` returns true (recursively checks `hasMd` and loaded children)
- On create/rename of `.md`: `setHasMdAt` marks immediately (before `refreshTree`)

---

## Release

**Process** (whenever a new release is requested):
1. Edit `package.json` → bump version
2. `git add package.json && git commit -m "chore: vX.Y.Z"`
3. `git tag vX.Y.Z && git push origin main vX.Y.Z`

**CI workflow** (`.github/workflows/build-dmg.yml`):
- Triggers on push of tag `v*`
- `cleanup` job: deletes all previous releases + all artifacts
- `build` job: matrix mac/win/linux → `softprops/action-gh-release` uploads directly to release (no intermediate artifacts)
- **Do not use artifacts** — that was what caused storage quota exhaustion

Other workflows:
- `cleanup-artifacts.yml` — runs daily via cron, deletes artifacts via API
- `doccheck.yml` — validates documentation references in pre-commit and CI

---

## Icons

- Source: `build/icon.svg` (geometric M in a rounded square, color `#3b7dd8`)
- PNGs generated with ImageMagick: `convert -background none -resize NxN icon.svg icon_N.png`
- `.icns` generated with `png2icns`
- Sizes: 16, 32, 48, 64, 128, 256, 512, 1024

---

## npm scripts

```bash
npm run dev          # electron-vite dev (requires a display)
npm run build        # production build
npm run typecheck    # tsc without emitting (both tsconfigs)
npm test             # vitest run
npm run doccheck     # validates documentation references
```

---

## Conventions

- Comments and commit messages in **English**
- File paths inside the vault always use `/` (not `path.sep`)
- No direct filesystem access in the renderer — always via `window.api`
- `refreshTree` only acts if the vault is expanded (avoids unnecessary loading)
- Immutable state: always `{ ...get().trees, [vaultId]: newTree }`
- `InputModal` rejects names containing `/` (frontend validation)
- Right-click on a file/folder in the sidebar copies the absolute path to the clipboard
- Autosave: 600ms after the last edit in the editor
