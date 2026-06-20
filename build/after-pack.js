// Ad-hoc code signing para macOS.
// Sem um Apple Developer ID (US$99/ano) não dá para notarizar, mas o
// ad-hoc signing (assinatura "-") é OBRIGATÓRIO no Apple Silicon: sem ele
// o macOS recusa o app como "damaged and can't be opened".
// Com ad-hoc, o usuário só precisa do clássico botão direito → Abrir uma vez.
const { execSync } = require('child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`
  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  // remove o atributo de quarentena que possa ter sido herdado
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
  } catch {
    /* xattr pode não existir/ falhar em CI; não é crítico */
  }
}
