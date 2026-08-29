// Ad-hoc code signing for macOS.
// Without an Apple Developer ID ($99/year) we can't notarize, but
// ad-hoc signing (signing with "-") is MANDATORY on Apple Silicon: without it
// macOS rejects the app as "damaged and can't be opened".
// With ad-hoc, the user only needs the classic right-click → Open once.
const { execSync } = require('child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`
  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  // remove the quarantine attribute that may have been inherited
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
  } catch {
    /* xattr may not exist / fail in CI; not critical */
  }
}
