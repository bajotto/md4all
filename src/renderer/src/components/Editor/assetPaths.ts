// Converts image paths between the form saved on disk (relative, e.g.:
// "assets/foo.png") and the URL served by the Electron custom protocol
// ("md4all-asset://<vaultId>/assets/foo.png"). This way the saved markdown
// remains portable (relative paths) and images appear in the editor.

const IMG_MD = /(!\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\))/g

function isRemote(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('data:')
}

/** disk -> display: prefixes relative paths with the vault protocol. */
export function toDisplay(markdown: string, vaultId: string): string {
  return markdown.replace(IMG_MD, (_m, pre, src, post) => {
    if (isRemote(src)) return `${pre}${src}${post}`
    const clean = src.replace(/^\.\//, '').replace(/^\/+/, '')
    return `${pre}md4all-asset://${vaultId}/${encodeURI(clean)}${post}`
  })
}

/** display -> disk: removes the protocol prefix, restoring the relative path. */
export function toStorage(markdown: string, vaultId: string): string {
  const prefix = `md4all-asset://${vaultId}/`
  return markdown.replace(IMG_MD, (_m, pre, src, post) => {
    if (src.startsWith(prefix)) {
      return `${pre}${decodeURI(src.slice(prefix.length))}${post}`
    }
    return `${pre}${src}${post}`
  })
}
