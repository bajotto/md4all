// Converte caminhos de imagem entre a forma salva em disco (relativa, ex.:
// "assets/foo.png") e a URL servida pelo protocolo customizado do Electron
// ("md4all-asset://<vaultId>/assets/foo.png"). Assim o markdown salvo
// permanece portável (caminhos relativos) e as imagens aparecem no editor.

const IMG_MD = /(!\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\))/g

function isRemote(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('data:')
}

/** disco -> exibição: prefixa caminhos relativos com o protocolo do vault. */
export function toDisplay(markdown: string, vaultId: string): string {
  return markdown.replace(IMG_MD, (_m, pre, src, post) => {
    if (isRemote(src)) return `${pre}${src}${post}`
    const clean = src.replace(/^\.\//, '').replace(/^\/+/, '')
    return `${pre}md4all-asset://${vaultId}/${encodeURI(clean)}${post}`
  })
}

/** exibição -> disco: remove o prefixo do protocolo, restaurando o caminho relativo. */
export function toStorage(markdown: string, vaultId: string): string {
  const prefix = `md4all-asset://${vaultId}/`
  return markdown.replace(IMG_MD, (_m, pre, src, post) => {
    if (src.startsWith(prefix)) {
      return `${pre}${decodeURI(src.slice(prefix.length))}${post}`
    }
    return `${pre}${src}${post}`
  })
}
