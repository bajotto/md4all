#!/usr/bin/env bash
# install-mac.sh — instalador do md4all para macOS.
#
# Baixa o DMG da release mais recente do GitHub, monta, copia o app para
# /Applications, remove o atributo de quarentena (com.apple.quarantine) que o
# Gatekeeper aplica a downloads não notarizados e abre o app.
#
# Com este script o usuário NÃO precisa rodar
#   xattr -cr /Applications/md4all.app && open /Applications/md4all.app
# manualmente — o script faz tudo.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash
#
# Ou, para uma versão específica:
#   curl -fsSL https://raw.githubusercontent.com/bajotto/md4all/main/scripts/install-mac.sh | bash -s -- v0.11.5
#
# Requer: macOS, curl, hdiutil, xattr (todos nativos do sistema).

set -euo pipefail

# --- Config -----------------------------------------------------------------
REPO="bajotto/md4all"
APP_NAME="md4all"
INSTALL_DIR="/Applications"
APP_PATH="${INSTALL_DIR}/${APP_NAME}.app"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

# --- Cores (só se stdout for TTY) -------------------------------------------
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

# --- Variáveis de cleanup (declaradas antes do trap) ------------------------
DMG_TEMP=""
MOUNT_POINT=""

cleanup() {
  if [ -n "${MOUNT_POINT}" ] && [ -d "${MOUNT_POINT}" ]; then
    log "Desmontando DMG..."
    hdiutil detach "${MOUNT_POINT}" -quiet >/dev/null 2>&1 || true
  fi
  if [ -n "${DMG_TEMP}" ] && [ -f "${DMG_TEMP}" ]; then
    rm -f "${DMG_TEMP}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --- Pré-verificações --------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "Este script só roda em macOS (detectado: $(uname -s))."
command -v curl    >/dev/null || die "curl não encontrado."
command -v hdiutil >/dev/null || die "hdiutil não encontrado."
command -v xattr   >/dev/null || die "xattr não encontrado."

# --- Detecta arquitetura -----------------------------------------------------
# uname -m: arm64 (Apple Silicon) | x86_64 (Intel)
# electron-builder nomeia os assets: md4all-<ver>-arm64.dmg | md4all-<ver>-x64.dmg
case "$(uname -m)" in
  arm64)    ARCH="arm64" ;;
  x86_64)   ARCH="x64"   ;;
  *)        die "Arquitetura não suportada: $(uname -m)" ;;
esac
ok "Arquitetura detectada: ${ARCH} ($(uname -m))"

# --- Determina a versão/asset -----------------------------------------------
# $1 (opcional) = tag específica (ex: v0.11.5). Sem argumento = latest.
if [ $# -ge 1 ] && [ -n "${1:-}" ]; then
  TAG="$1"
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
  log "Buscando release ${TAG}..."
else
  log "Buscando release mais recente..."
fi

# GitHub API pode rate-limitar sem token; usamos -f para falhar em erro HTTP.
RELEASE_JSON="$(curl -fsSL -H "Accept: application/vnd.github.v3+json" "${API_URL}" \
  || die "Não foi possível obter a release (${API_URL}).")"

# Extrai a tag e a URL de download do DMG da arquitetura correta.
# Sem jq (nem todo macOS tem instalado): usamos grep + sed contra o JSON.
# O asset tem nome no formato md4all-<version>-<arch>.dmg
TAG_FOUND="$(printf '%s' "${RELEASE_JSON}" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
[ -n "${TAG_FOUND}" ] || die "Não foi possível ler a tag da release."

# Procura o browser_download_url cujo nome termina em -<ARCH>.dmg
# O JSON lista assets com "browser_download_url": "https://.../md4all-X.Y.Z-arm64.dmg"
DMG_URL="$(printf '%s' "${RELEASE_JSON}" \
  | grep -oE '"browser_download_url"[[:space:]]*:[[:space:]]*"https://[^"]+-'"${ARCH}"'\.dmg"' \
  | sed -E 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
  | head -n1)"

[ -n "${DMG_URL}" ] || die "Nenhum DMG para arquitetura ${ARCH} encontrado na release ${TAG_FOUND}."
ok "Release: ${TAG_FOUND}"
ok "DMG: $(basename "${DMG_URL}")"

# --- Baixa o DMG -------------------------------------------------------------
DMG_TEMP="$(mktemp -t md4all_install_XXXXXX).dmg"
log "Baixando DMG..."
curl -fSL --progress-bar -o "${DMG_TEMP}" "${DMG_URL}" \
  || die "Falha no download do DMG."
ok "Download concluído: $(du -h "${DMG_TEMP}" | cut -f1)"

# --- Monta o DMG -------------------------------------------------------------
log "Montando DMG..."
# hdiutil attach imprime linhas; a última coluna é o mount point.
# /dev/diskNsN  Apple_HFS   /Volumes/md4all 0.11.5
MOUNT_OUTPUT="$(hdiutil attach "${DMG_TEMP}" -nobrowse -quiet \
  || die "Falha ao montar o DMG.")"
# pega o último campo (mount point) da última linha não-vazia
MOUNT_POINT="$(printf '%s\n' "${MOUNT_OUTPUT}" | awk 'NF{last=$NF} END{print last}')"
[ -n "${MOUNT_POINT}" ] && [ -d "${MOUNT_POINT}" ] \
  || die "Não foi possível determinar o ponto de montagem do DMG."
ok "Montado em: ${MOUNT_POINT}"

# Localiza o .app dentro do volume montado
APP_IN_DMG="$(find "${MOUNT_POINT}" -maxdepth 1 -name "${APP_NAME}.app" -type d | head -n1)"
[ -n "${APP_IN_DMG}" ] && [ -d "${APP_IN_DMG}" ] \
  || die "${APP_NAME}.app não encontrado dentro do DMG."

# --- Instala em /Applications -----------------------------------------------
# Remove instalação anterior (se existir) para evitar arquivos stale.
if [ -d "${APP_PATH}" ]; then
  warn "Instalação anterior encontrada em ${APP_PATH} — removendo."
  rm -rf "${APP_PATH}" || die "Não foi possível remover ${APP_PATH} (permissão?)."
fi

log "Copiando ${APP_NAME}.app para ${INSTALL_DIR}/..."
# cp -R preserva o bundle; -p preserva timestamps.
cp -Rp "${APP_IN_DMG}" "${APP_PATH}" \
  || die "Falha ao copiar o app para ${INSTALL_DIR}."
ok "App copiado para ${APP_PATH}"

# --- Remove a quarentena (o workaround central) ------------------------------
# O Gatekeeper adiciona com.apple.quarantine a apps baixados da internet.
# Como o app é ad-hoc signed (sem Developer ID/notarização), o macOS recusa
# abrir com "damaged and can't be opened". xattr -cr limpa todos os atributos
# estendidos do bundle, removendo a quarentena.
log "Removendo atributo de quarentena (xattr -cr)..."
xattr -cr "${APP_PATH}" \
  || die "Falha ao remover atributos estendidos de ${APP_PATH}."
ok "Quarentena removida."

# --- Abre o app --------------------------------------------------------------
log "Abrindo ${APP_NAME}..."
open "${APP_PATH}" || die "App instalado mas não foi possível abrir automaticamente."

echo ""
printf '%s%s✅ md4all %s instalado com sucesso em %s%s\n' \
  "${C_BOLD}${C_GREEN}" "${C_RESET}" "${TAG_FOUND}" "${APP_PATH}" "${C_RESET}"
echo ""
echo "Próximas vezes, abra pelo Launchpad ou:"
echo "  open -a md4all"
