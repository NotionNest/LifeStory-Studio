import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface RuntimeInfo {
  appVersion: string
  platform: string
  architecture: string
  storage: {
    dataDirectory: string
    schemaVersion: number
    sqliteVersion: string
    fts5Available: boolean
  }
}

export const desktopAvailable = isTauri()

export const desktop = {
  readRuntimeInfo: () => invoke<RuntimeInfo>('runtime_info'),
  onExitRequested: (handler: () => void) => listen('exit-requested', handler),
  exit: () => invoke<void>('record_exit'),
  setTheme: (theme: 'light' | 'dark' | null) => getCurrentWindow().setTheme(theme),
}
