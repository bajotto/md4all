import { promises as fs } from 'fs'
import path from 'path'
import { BrowserWindow, dialog } from 'electron'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import katexImport from '@vscode/markdown-it-katex'
import { getVault, resolveInVault } from './vault'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch {
        /* cai no escape padrão */
      }
    }
    return MarkdownIt().utils.escapeHtml(code)
  }
})

// Math/LaTeX com os mesmos delimitadores do editor ($ inline, $$ em bloco).
// Saída em MathML: renderiza nativamente no Chromium (printToPDF) e em
// navegadores modernos, sem precisar embutir CSS/fontes do KaTeX.
// O interop do default export difere entre o bundle (objeto { default }) e o
// node puro (a própria função), então normalizamos aqui.
const katexPlugin = (katexImport as { default?: typeof katexImport }).default ?? katexImport
md.use(katexPlugin, { throwOnError: false, output: 'mathml' })

// Blocos ```mermaid``` viram <pre class="mermaid"> com o código como texto;
// o diagrama é renderizado para SVG numa janela Chromium oculta (ver abaixo),
// deixando o HTML/PDF exportado portável (SVG embutido, sem script).
const defaultFence = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, self): string => {
  const info = tokens[idx].info.trim().toLowerCase()
  if (info === 'mermaid') {
    return `<pre class="mermaid">${md.utils.escapeHtml(tokens[idx].content)}</pre>\n`
  }
  return defaultFence
    ? defaultFence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

// Wikilinks [[alvo]] / [[alvo|alias]] → texto exibido estilizado (documento
// estático: não há destino navegável garantido no HTML exportado).
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) return false
  const end = state.src.indexOf(']]', start + 2)
  if (end < 0) return false
  const inner = state.src.slice(start + 2, end)
  if (!inner || inner.includes('\n')) return false
  if (!silent) {
    const parts = inner.split('|')
    const display = (parts[1] ?? parts[0]).split('#')[0].trim()
    const token = state.push('wikilink', '', 0)
    token.content = display
  }
  state.pos = end + 2
  return true
})
md.renderer.rules.wikilink = (tokens, idx): string =>
  `<span class="wikilink">${md.utils.escapeHtml(tokens[idx].content)}</span>`

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
}

function isRemote(src: string): boolean {
  return /^(https?:|data:)/i.test(src)
}

/** Lê as imagens locais referenciadas e as embute como data-URI (HTML portável). */
async function inlineImages(html: string, vaultId: string): Promise<string> {
  const matches = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
  let out = html
  for (const m of matches) {
    const src = m[1]
    if (isRemote(src)) continue
    let rel = src
    const prefix = `md4all-asset://${vaultId}/`
    if (src.startsWith(prefix)) rel = decodeURI(src.slice(prefix.length))
    rel = rel.replace(/^\.\//, '').replace(/^\/+/, '')
    try {
      const abs = resolveInVault(vaultId, rel)
      const bytes = await fs.readFile(abs)
      const mime = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream'
      const dataUri = `data:${mime};base64,${bytes.toString('base64')}`
      out = out.split(`src="${src}"`).join(`src="${dataUri}"`)
    } catch {
      /* imagem ausente: mantém o src original */
    }
  }
  return out
}

const STYLES = `
:root { color-scheme: light; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.7; color: #1f1f1d; max-width: 820px; margin: 40px auto; padding: 0 24px; }
h1,h2,h3,h4 { line-height: 1.25; margin-top: 1.6em; }
h1 { font-size: 2em; border-bottom: 1px solid #e2e2dd; padding-bottom: .3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #e2e2dd; padding-bottom: .3em; }
a { color: #3b7dd8; }
img { max-width: 100%; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #e2e2dd; padding: 6px 12px; text-align: left; }
th { background: #f7f7f5; }
code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: .9em;
  background: #f0f0ed; padding: .15em .4em; border-radius: 4px; }
pre { background: #f7f7f5; padding: 14px 16px; border-radius: 8px; overflow: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #e2e2dd; margin: 1em 0; padding: 0 1em; color: #6b6b66; }
ul.contains-task-list { list-style: none; padding-left: 1.2em; }
.hljs-keyword,.hljs-selector-tag { color: #b86bb8; }
.hljs-string,.hljs-attr { color: #3b9b6b; }
.hljs-number,.hljs-literal { color: #c07a2c; }
.hljs-title,.hljs-function .hljs-title { color: #3b7dd8; }
.hljs-comment { color: #9a9a95; font-style: italic; }
.katex-block { text-align: center; margin: 1em 0; overflow-x: auto; }
math { font-size: 1.05em; }
.mermaid { text-align: center; margin: 1em 0; }
.mermaid svg { max-width: 100%; height: auto; }
.wikilink { color: #3b7dd8; border-bottom: 1px dashed #3b7dd8; }
`

/** Monta um documento HTML completo a partir do markdown (forma de armazenamento). */
export async function renderDocument(
  vaultId: string,
  title: string,
  markdown: string
): Promise<string> {
  const body = md.render(markdown)
  const inlined = await inlineImages(body, vaultId)
  const safeTitle = md.utils.escapeHtml(title)
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${safeTitle}</title>
<style>${STYLES}</style></head>
<body>${inlined}</body></html>`
}

function defaultPath(vaultId: string, relPath: string, ext: string): string {
  const vault = getVault(vaultId)
  const base = relPath.replace(/\.[^.]+$/, '')
  return path.join(vault.path, `${base}.${ext}`)
}

function hasMermaid(html: string): boolean {
  return html.includes('class="mermaid"')
}

// bundle UMD do mermaid, lido sob demanda e mantido em cache
let mermaidScript: string | null = null
async function loadMermaidScript(): Promise<string> {
  if (mermaidScript == null) {
    const p = require.resolve('mermaid/dist/mermaid.min.js')
    mermaidScript = await fs.readFile(p, 'utf-8')
  }
  return mermaidScript
}

/** Renderiza os <pre class="mermaid"> de uma janela já carregada (em SVG inline). */
async function renderMermaidIn(win: BrowserWindow): Promise<void> {
  const script = await loadMermaidScript()
  // `;0` garante um valor de retorno clonável (o UMD avalia para o objeto mermaid)
  await win.webContents.executeJavaScript(`${script}\n;0`)
  await win.webContents.executeJavaScript(
    `(async () => {
      try {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        await window.mermaid.run({ querySelector: '.mermaid' })
      } catch (e) { console.error('mermaid:', e && e.message) }
    })()`
  )
}

export async function exportHtml(
  vaultId: string,
  relPath: string,
  markdown: string
): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultPath(vaultId, relPath, 'html'),
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (result.canceled || !result.filePath) return null
  let html = await renderDocument(vaultId, path.basename(relPath), markdown)
  // diagramas mermaid: renderiza numa janela oculta e embute o SVG resultante
  if (hasMermaid(html)) {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await renderMermaidIn(win)
      const rendered = (await win.webContents.executeJavaScript(
        'document.documentElement.outerHTML'
      )) as string
      html = `<!doctype html>\n${rendered}`
    } finally {
      win.destroy()
    }
  }
  await fs.writeFile(result.filePath, html, 'utf-8')
  return result.filePath
}

export async function exportPdf(
  vaultId: string,
  relPath: string,
  markdown: string
): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultPath(vaultId, relPath, 'pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null

  const html = await renderDocument(vaultId, path.basename(relPath), markdown)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    if (hasMermaid(html)) await renderMermaidIn(win)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
      pageSize: 'A4'
    })
    await fs.writeFile(result.filePath, pdf)
  } finally {
    win.destroy()
  }
  return result.filePath
}
