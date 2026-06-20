#!/usr/bin/env bash
# Gera o DMG no seu Mac local.
# Pré-requisitos: Node 18+, npm install já rodado.
#
# Uso básico (sem assinatura):
#   chmod +x scripts/build-dmg-local.sh && ./scripts/build-dmg-local.sh
#
# Uso com Apple Developer ID (para distribuição sem Gatekeeper):
#   CSC_LINK="~/cert.p12" CSC_KEY_PASSWORD="senha" \
#   APPLE_ID="seu@email.com" APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
#   APPLE_TEAM_ID="XXXXXXXXXX" ./scripts/build-dmg-local.sh

set -euo pipefail

echo "▶ Building renderer + main..."
npm run build

echo "▶ Packaging DMG (x64)..."
npx electron-builder --mac dmg --x64

echo "▶ Packaging DMG (arm64 / Apple Silicon)..."
npx electron-builder --mac dmg --arm64

echo ""
echo "✅ DMGs gerados em dist/:"
ls -lh dist/*.dmg 2>/dev/null || echo "(nenhum .dmg encontrado — verifique os logs acima)"
