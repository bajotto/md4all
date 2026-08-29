# md4all — Scientific Protocol

## Current Phase

- Phase: 2 (Pilot) — RDP/icon task
- Status: ✅ COMPLETE — awaiting approval for Phase 3 (user install on RDP session)
- Date: 2026-08-29

## Reference

- `/home/main/.claude/GLOBAL_SCIENTIFIC_METHOD.md`

---

## Task: Logo in the header + Onboarding/LLM blocking without a key

### Hypotheses

- H1: Adding `<Logo size={20}/>` in `.sidebar-header` (flexbox) aligns icon + title in the top-left corner without layout regression.
- H2: Without an OpenRouter key, LLM buttons (🤖, Hybrid) are blocked and open the ⚙ modal; with a key, they work normally.
- H3: No real key is embedded in the code/binary (placeholder only).

### Acceptance criteria

- ✅ Logo visible next to "md4all" in the sidebar header
- ✅ No layout regression (coherent bottom border and padding)
- ✅ First run without a key → ⚙ modal opens on its own (onboarding)
- ✅ 🤖 and Hybrid blocked without a key; click opens ⚙
- ✅ With a configured key, 🤖 and Hybrid work as before
- ✅ `grep -rn "sk-or-"` (excluding placeholder) returns 0 occurrences

### Result (Phase 2 — Pilot)

- Status: PASS
- typecheck: ✅ 0 errors
- tests: ✅ 33/33 passing
- key audit: ✅ ZERO occurrences of real `sk-or-`; no `.env`/secret tracked

### Files changed

- `src/renderer/src/components/Sidebar/Sidebar.tsx` — Logo in the header
- `src/renderer/src/styles/global.css` — `.sidebar-header` flex + `.sidebar-wordmark`
- `src/renderer/src/store/useStore.ts` — `llmConfigured` + `refreshLlmConfigured` + onboarding in `init`
- `src/renderer/src/components/Sidebar/VaultPicker.tsx` — 🤖 blocked without a key
- `src/renderer/src/components/SearchPanel/SearchPanel.tsx` — Hybrid blocked without a key

### Errors

- None.

---

## Task: App won't open on Ubuntu RDP + invalid icon

### Hypotheses

- H1: On xrdp/VNC/headless Linux there is no GPU, so Electron's GPU compositor never produces a first frame → `ready-to-show` never fires → window stays hidden ("installs but doesn't open"). Disabling hardware acceleration on remote/headless Linux makes the window open.
- H2: A 3s safety-net `show()` guarantees the window is visible even if `ready-to-show` is delayed/lost.
- H3: The icons were 16-bit sRGB PNGs, which Linux hicolor theme / several DEs reject → "invalid icon". Regenerating as 8-bit RGBA fixes it.
- H4: No regression for mac/win/normal Linux desktop with a real GPU.

### Acceptance criteria

- ✅ `typecheck` 0 errors
- ✅ `npm test` 33/33 passing
- ✅ GPU disabled ONLY on Linux remote/headless (xrdp env OR no `/dev/dri/renderD128`); mac/win/normal Linux untouched
- ✅ Window shows within 3s even if `ready-to-show` never fires
- ✅ All `build/icon*.png` report 8-bit depth via `identify`
- ✅ `build/icon.icns` rebuilt from 8-bit sources
- ✅ `grep -rn "sk-or-"` (excluding placeholder) returns 0 occurrences

### Result (Phase 2 — Pilot)

- Status: PASS
- typecheck: ✅ 0 errors
- tests: ✅ 33/33 passing
- icon audit: ✅ all PNGs 8-bit; `icon.icns` rebuilt (75KB, was 147KB of 16-bit data)
- key audit: ✅ ZERO occurrences of real `sk-or-`

### Files changed

- `src/main/index.ts` — `isRemoteLinuxSession()` (xrdp env + `/dev/dri/renderD128` check) → `app.disableHardwareAcceleration()` + `disable-gpu` switch; 3s safety-net `show()` fallback; `win.on` → `win.once('ready-to-show')` with `clearTimeout`
- `build/icon.png` + `build/icon_{16,32,48,64,128,256,512,1024}.png` — regenerated as 8-bit RGBA from `icon.svg`
- `build/icon.icns` — rebuilt from 8-bit sources via `png2icns`

### Pending user validation (Phase 3 gate)

- Install the new Linux build on the Ubuntu RDP session → confirm the window opens.
- Confirm the icon renders correctly in the DE taskbar / app launcher.

### Errors

- None.

---

