#!/usr/bin/env bash
# install-mac.sh — md4all installer for macOS.
#
# Downloads the DMG from the latest GitHub release, mounts it, copies the app
# to /Applications, removes the quarantine attribute (com.apple.quarantine)
# that Gatekeeper applies to non-notarized downloads, and opens the app.
#
# With this script the user does NOT need to run
#   xattr -cr /Applications/md4all.app && open /Applications/md4all.app
# manually — the script does everything.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash
#
# Or, for a specific version:
#   curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash -s -- v0.11.5
#
# Requires: macOS, curl, hdiutil, xattr (all built into the system).

set -euo pipefail

# --- Config -----------------------------------------------------------------
REPO="bajotto/md4all"
APP_NAME="md4all"
INSTALL_DIR="/Applications"
APP_PATH="${INSTALL_DIR}/${APP_NAME}.app"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

# --- Colors (only if stdout is a TTY) ---------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=""; C_BOLD=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_BLUE=""
fi

log()  { printf '%s▶%s %s\n'  "${C_BLUE}"   "${C_RESET}" "$*"; }
ok()   { printf '%s✓%s %s\n'  "${C_GREEN}"  "${C_RESET}" "$*"; }
warn() { printf '%s!%s %s\n'  "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
err()  { printf '%s✗%s %s\n'  "${C_RED}"    "${C_RESET}" "$*" >&2; }
die()  { err "$*"; exit 1; }

# --- Cleanup variables (declared before the trap) ----------------------------
DMG_TEMP=""
MOUNT_POINT=""

cleanup() {
  if [ -n "${MOUNT_POINT}" ] && [ -d "${MOUNT_POINT}" ]; then
    log "Unmounting DMG..."
    hdiutil detach "${MOUNT_POINT}" -quiet >/dev/null 2>&1 || true
  fi
  if [ -n "${DMG_TEMP}" ] && [ -f "${DMG_TEMP}" ]; then
    rm -f "${DMG_TEMP}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --- Pre-checks --------------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "This script only runs on macOS (detected: $(uname -s))."
command -v curl    >/dev/null || die "curl not found."
command -v hdiutil >/dev/null || die "hdiutil not found."
command -v xattr   >/dev/null || die "xattr not found."

# --- Detect architecture -----------------------------------------------------
# uname -m: arm64 (Apple Silicon) | x86_64 (Intel)
# electron-builder names assets: md4all-<ver>-arm64.dmg | md4all-<ver>-x64.dmg
case "$(uname -m)" in
  arm64)    ARCH="arm64" ;;
  x86_64)   ARCH="x64"   ;;
  *)        die "Unsupported architecture: $(uname -m)" ;;
esac
ok "Architecture detected: ${ARCH} ($(uname -m))"

# --- Determine version/asset ------------------------------------------------
# $1 (optional) = specific tag (e.g. v0.11.5). No argument = latest.
if [ $# -ge 1 ] && [ -n "${1:-}" ]; then
  TAG="$1"
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
  log "Fetching release ${TAG}..."
else
  log "Fetching latest release..."
fi

# GitHub API may rate-limit without a token; we use -f to fail on HTTP error.
RELEASE_JSON="$(curl -fsSL -H "Accept: application/vnd.github.v3+json" "${API_URL}" \
  || die "Could not fetch the release (${API_URL}).")"

# Extract the tag and the download URL for the correct architecture's DMG.
# Without jq (not installed on every macOS): we use grep + sed against the JSON.
# The asset name format is md4all-<version>-<arch>.dmg
TAG_FOUND="$(printf '%s' "${RELEASE_JSON}" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
[ -n "${TAG_FOUND}" ] || die "Could not read the release tag."

# Find the browser_download_url whose name ends in -<ARCH>.dmg
# The JSON lists assets with "browser_download_url": "https://.../md4all-X.Y.Z-arm64.dmg"
DMG_URL="$(printf '%s' "${RELEASE_JSON}" \
  | grep -oE '"browser_download_url"[[:space:]]*:[[:space:]]*"https://[^"]+-'"${ARCH}"'\.dmg"' \
  | sed -E 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
  | head -n1)"

[ -n "${DMG_URL}" ] || die "No DMG for architecture ${ARCH} found in release ${TAG_FOUND}."
ok "Release: ${TAG_FOUND}"
ok "DMG: $(basename "${DMG_URL}")"

# --- Download the DMG --------------------------------------------------------
DMG_TEMP="$(mktemp -t md4all_install_XXXXXX).dmg"
log "Downloading DMG..."
curl -fSL --progress-bar -o "${DMG_TEMP}" "${DMG_URL}" \
  || die "Failed to download the DMG."
ok "Download complete: $(du -h "${DMG_TEMP}" | cut -f1)"

# --- Mount the DMG -----------------------------------------------------------
log "Mounting DMG..."
# hdiutil attach prints lines; the last column is the mount point.
# /dev/diskNsN  Apple_HFS   /Volumes/md4all 0.11.5
MOUNT_OUTPUT="$(hdiutil attach "${DMG_TEMP}" -nobrowse -quiet \
  || die "Failed to mount the DMG.")"
# get the last field (mount point) of the last non-empty line
MOUNT_POINT="$(printf '%s\n' "${MOUNT_OUTPUT}" | awk 'NF{last=$NF} END{print last}')"
[ -n "${MOUNT_POINT}" ] && [ -d "${MOUNT_POINT}" ] \
  || die "Could not determine the DMG mount point."
ok "Mounted at: ${MOUNT_POINT}"

# Locate the .app inside the mounted volume
APP_IN_DMG="$(find "${MOUNT_POINT}" -maxdepth 1 -name "${APP_NAME}.app" -type d | head -n1)"
[ -n "${APP_IN_DMG}" ] && [ -d "${APP_IN_DMG}" ] \
  || die "${APP_NAME}.app not found inside the DMG."

# --- Install to /Applications ------------------------------------------------
# Remove previous installation (if any) to avoid stale files.
if [ -d "${APP_PATH}" ]; then
  warn "Previous installation found at ${APP_PATH} — removing."
  rm -rf "${APP_PATH}" || die "Could not remove ${APP_PATH} (permission?)."
fi

log "Copying ${APP_NAME}.app to ${INSTALL_DIR}/..."
# cp -R preserves the bundle; -p preserves timestamps.
cp -Rp "${APP_IN_DMG}" "${APP_PATH}" \
  || die "Failed to copy the app to ${INSTALL_DIR}."
ok "App copied to ${APP_PATH}"

# --- Remove quarantine (the core workaround) ---------------------------------
# Gatekeeper adds com.apple.quarantine to apps downloaded from the internet.
# Since the app is ad-hoc signed (no Developer ID / notarization), macOS refuses
# to open it with "damaged and can't be opened". xattr -cr clears all extended
# attributes from the bundle, removing the quarantine flag.
log "Removing quarantine attribute (xattr -cr)..."
xattr -cr "${APP_PATH}" \
  || die "Failed to remove extended attributes from ${APP_PATH}."
ok "Quarantine removed."

# --- Open the app ------------------------------------------------------------
log "Opening ${APP_NAME}..."
open "${APP_PATH}" || die "App installed but could not be opened automatically."

echo ""
printf '%s%s✅ md4all %s installed successfully at %s%s\n' \
  "${C_BOLD}${C_GREEN}" "${C_RESET}" "${TAG_FOUND}" "${APP_PATH}" "${C_RESET}"
echo ""
echo "Next time, open via Launchpad or:"
echo "  open -a md4all"
