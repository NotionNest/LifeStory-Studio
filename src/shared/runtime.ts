import { invoke, isTauri } from '@tauri-apps/api/core'

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

export function readRuntimeInfo(): Promise<RuntimeInfo> {
  return invoke<RuntimeInfo>('runtime_info')
}
