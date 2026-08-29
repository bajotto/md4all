# md4all — Scientific Protocol

## Current Phase

- Phase: 2 (Pilot)
- Status: ✅ COMPLETE — awaiting approval for Phase 3 (scale)
- Date: 2026-08-28

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

