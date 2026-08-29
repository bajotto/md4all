# md4all

Complete WYSIWYG Markdown editor for desktop (Electron), in the style of Obsidian/Typora.
Writes to any configurable folder — **local disk, iCloud Drive, or mounted SMB share**.

## Installation

### macOS

The app is ad-hoc signed (no Apple Developer ID / notarization), so Gatekeeper
blocks the download with "damaged and can't be opened". The installer below downloads the
DMG from the latest release, copies it to `/Applications` and removes the quarantine
automatically — **no need to run `xattr -cr` manually**:

```bash
curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash
```

For a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash -s -- v0.11.5
```

> Manual alternative: download the `.dmg` from [Releases](https://github.com/bajotto/md4all/releases),
> copy the app to `/Applications` and run `xattr -cr /Applications/md4all.app`.

### Linux / Windows

Download the installer from [Releases](https://github.com/bajotto/md4all/releases)
(`.AppImage`/`.deb` for Linux, `.exe` for Windows).

## Features

- **Inline WYSIWYG** (Milkdown Crepe): the syntax is hidden and the content renders in place.
- **Toggle WYSIWYG ↔ Source** (CodeMirror 6) to edit raw markdown.
- **Images**: rendered in the editor + paste/drag → saved to `<vault>/assets/` with a portable
  relative path. Served via the internal `md4all-asset://` protocol.
- **GFM Tables** editable, code blocks with syntax highlighting, task lists.
- **Vault** = folder. Multiple configurable vaults; each points to any path
  (local, iCloud, mounted SMB).
- **Sidebar** with file tree (create/rename/delete), **tabs**, **full-text search**.
- **Auto-save** with debounce + `Ctrl/Cmd+S`; external change detection (chokidar) with
  automatic reload when the open file has no pending edits.
- **Export PDF and HTML** (markdown-it + highlight.js), with images embedded as data-URI
  for a portable file. PDF generated via Electron's `printToPDF`.
- **Light/dark theme**.

## Architecture

- `src/main/` — main process: filesystem I/O (`vault.ts`), watcher (`watcher.ts`),
  search (`search.ts`), settings (`settings.ts`, via electron-store), IPC handlers (`ipc.ts`)
  and the image protocol (`index.ts`). All writes are validated against path traversal.
- `src/preload/` — `contextBridge` exposes a secure API (`window.api`); no `nodeIntegration`.
- `src/renderer/` — React + Zustand. Editor in `components/Editor/` (Crepe/CodeMirror + toggle),
  sidebar in `components/Sidebar/`, tabs in `components/Tabs/`.

## Development

```bash
npm install
npm run dev        # opens the window with HMR
npm run typecheck  # type checking
npm run build      # bundles in out/
```

### Packaging

```bash
npm run build:linux   # or build:mac / build:win (electron-builder)
```

## Storage (local / iCloud / SMB)

The app does not speak cloud protocols directly: it reads/writes to a **folder path**.
Just point the vault to the correct folder:

- **Local**: any directory.
- **iCloud (macOS)**: folder inside `~/Library/Mobile Documents/...`.
- **SMB**: share already mounted by the OS (`/Volumes/...` on macOS, `/mnt/...` on Linux,
  `\\host\share` on Windows). Synchronization is handled by the OS/service.

## Known issues

- When saving images, Milkdown Crepe may rewrite the image's alt-text (`![alt]`).
  The file path is preserved as relative.
