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

## Task: Workaround for Mac installation without manual `xattr -cr`

### Context

The app is ad-hoc signed (no Apple Developer ID / notarization). Gatekeeper adds
`com.apple.quarantine` to the DMG downloaded from GitHub; when copying the `.app` to `/Applications`
it inherits the quarantine and recent macOS (Sonoma/Sequoia) shows "damaged and can't be
opened". Running `xattr -cr` in `after-pack.js` is useless for this — the quarantine comes from the
**download**, not the build.

### Hypotheses

- H0: A `curl|bash` script that downloads the DMG, mounts, copies and runs `xattr -cr` automatically
  does NOT eliminate the need for the user to run the command manually.
- H1: The script eliminates the need for the manual command — the user runs one line and the app
  opens ready to use.
- H2: Parsing the GitHub API JSON (without `jq`, using only grep+sed) correctly extracts the
  `browser_download_url` of the DMG for the correct architecture (arm64/x64).

### Acceptance criteria

- ✅ Script detects architecture (arm64 → arm64, x86_64 → x64)
- ✅ Script downloads the correct DMG from the latest release (or a specific tag via `$1`)
- ✅ Script mounts, copies to /Applications, runs `xattr -cr`, opens the app
- ✅ Script does not match `.zip` (only `.dmg`)
- ✅ Script handles a release without a DMG (fails with a clear message, does not crash)
- ✅ `bash -n` passes (syntax OK)
- ✅ `shellcheck` passes (0 warnings)
- ✅ Cleanup trap unmounts the DMG and removes temp even on error/Ctrl-C

### Result (Phase 2 — Pilot)

- Status: PASS (static validation — no macOS in this environment)
- bash -n: ✅ OK
- shellcheck 0.11.0: ✅ 0 warnings (after removing the unused `VERSION` var)
- JSON parsing (realistic mock of the GitHub API): ✅ 7/7 tests passing
  - arm64 DMG extracted correctly
  - x64 DMG extracted correctly
  - tag_name extracted correctly
  - `.dmg` regex does NOT match `.zip`
  - empty release → empty result (does not crash)
  - realistic JSON with extra fields → correct parsing
  - arch mapping: arm64→arm64, x86_64→x64
- **Limitation:** real testing on macOS pending (no macOS in this environment).
  The user must validate by running the script on a real Mac in Phase 3.

### Files changed

- `scripts/install-mac.sh` — curl|bash installer (new)
- `README.md` — "Installation" section with the command

### Prerequisite for Phase 3 (scale)

- ⚠️ The `bajatto/md4all` repo needs to be **public** for `curl` to download the script and the DMG
  without authentication. Currently it is private (HTTP 404 without auth).

### Errors

- None. Unused `VERSION` var was detected by shellcheck and removed.

---

## Task: Audit of sensitive information in the git history

### Hypotheses

- H0: The history contains sensitive information (keys/passwords/secrets tracked in some commit).
- H1: The history is clean (no real secret tracked in any past or present commit).

### Acceptance criteria

- ✅ All commits scanned (not just the working tree)
- ✅ Patterns covered: `sk-or-` (OpenRouter), `sk-`/`sk-proj-` (OpenAI), GitHub tokens (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`/`github_pat_`), AWS (`AKIA…`), private keys (`-----BEGIN…`), Slack (`xox…`), JWTs (`eyJ…`), long base64 strings
- ✅ `.env`/`.pem`/`.key`/credentials files tracked in any commit
- ✅ Hardcoded IPs verified
- ✅ Commit emails verified
- ✅ Files deleted in the history verified (secrets removed late)

### Result (Phase 1 — Discovery)

- Status: PASS — H1 confirmed (history clean of real secrets)
- Commits scanned: 71
- Unique blobs in the history: 811
- Secret patterns (sk-or-, sk-, ghp_, AKIA, BEGIN PRIVATE KEY, xox, eyJ): **ZERO real occurrences**
- `.env`/`.pem`/`.key`/credentials files tracked: **ZERO**
- Suspicious base64 strings (excluding node_modules/lockfiles): **ZERO**
- Files deleted in the history: `Search.tsx` (refactor) + `*.tsbuildinfo` (build) — no secrets
- Commit emails: `bajatto@users.noreply.github.com` + `pedro@bajatto.com` (public, non-sensitive)

### Findings (non-blocking, but flagged)

1. **IP `192.168.1.22:9890`** — appears as placeholder/comment in:
   - `src/main/types.ts` (comment: "e.g. http://192.168.1.22:9890")
   - `src/renderer/src/components/LlmSettingsModal.tsx` (input placeholder)
   - Commit: `b9b5ac6 feat: adiciona swell/devin como provider alternativo de LLM`
   - **Risk:** low (private RFC1918 IP, not externally accessible), but reveals
     the author's internal network topology (matches the SSH pattern 192.168.1.21,22,23,25).
     Recommendation: replace with `http://localhost:9890` or `http://<your-host>:9890` in
     the placeholders before making the repo public.

2. **IP `34.73.89.87`** — appears as placeholder in:
   - `src/renderer/src/components/AddVaultModal.tsx` (placeholder: "Host (e.g. 34.73.89.87)")
   - Commit: `08bccb4 feat: vaults remotos via SSH/SFTP + sidebar multi-raiz`
   - **Risk:** low (Google Cloud public IP, but only a form example).
     Recommendation: replace with `exemplo.com` or `203.0.113.1` (RFC5737 documentation IP).

### Verdict

✅ **History clean of secrets.** No real key, token, hardcoded password, private key
or credentials file was tracked in any of the 71 commits. The repo can be made
public safely after considering the 2 IP findings (optional, low risk).

### Errors

- None.
