#!/usr/bin/env bash
# Build the DMG on your local Mac.
# Prerequisites: Node 18+, npm install already run.
#
# Basic usage (no signing):
#   chmod +x scripts/build-dmg-local.sh && ./scripts/build-dmg-local.sh
#
# Usage with Apple Developer ID (for distribution without Gatekeeper):
#   CSC_LINK="~/cert.p12" CSC_KEY_PASSWORD="password" \
#   APPLE_ID="your@email.com" APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
#   APPLE_TEAM_ID="XXXXXXXXXX" ./scripts/build-dmg-local.sh

set -euo pipefail

echo "▶ Building renderer + main..."
npm run build

echo "▶ Packaging DMG (x64)..."
npx electron-builder --mac dmg --x64

echo "▶ Packaging DMG (arm64 / Apple Silicon)..."
npx electron-builder --mac dmg --arm64

echo ""
echo "✅ DMGs generated in dist/:"
ls -lh dist/*.dmg 2>/dev/null || echo "(no .dmg found — check the logs above)"
