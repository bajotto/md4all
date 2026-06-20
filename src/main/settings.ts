import Store from 'electron-store'
import type { AppSettings } from './types'

const store = new Store<AppSettings>({
  defaults: {
    vaults: [],
    activeVaultId: null,
    theme: 'light'
  }
})

export function getSettings(): AppSettings {
  return {
    vaults: store.get('vaults'),
    activeVaultId: store.get('activeVaultId'),
    theme: store.get('theme')
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.vaults !== undefined) store.set('vaults', patch.vaults)
  if (patch.activeVaultId !== undefined) store.set('activeVaultId', patch.activeVaultId)
  if (patch.theme !== undefined) store.set('theme', patch.theme)
  return getSettings()
}
