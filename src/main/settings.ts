import Store from 'electron-store'
import type { AppSettings } from './types'

const store = new Store<AppSettings>({
  defaults: {
    vaults: [],
    activeVaultId: null,
    theme: 'light',
    llm: {}
  }
})

export function getSettings(): AppSettings {
  return {
    vaults: store.get('vaults'),
    activeVaultId: store.get('activeVaultId'),
    theme: store.get('theme'),
    llm: store.get('llm') ?? {}
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  if (patch.vaults !== undefined) store.set('vaults', patch.vaults)
  if (patch.activeVaultId !== undefined) store.set('activeVaultId', patch.activeVaultId)
  if (patch.theme !== undefined) store.set('theme', patch.theme)
  // shallow merge of the llm object to avoid erasing fields not sent
  if (patch.llm !== undefined) store.set('llm', { ...(store.get('llm') ?? {}), ...patch.llm })
  return getSettings()
}
