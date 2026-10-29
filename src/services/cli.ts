import { invoke } from '@tauri-apps/api/core'
import type { AiProfile } from './modelProfiles'

export interface CliInstallation {
  kind: string
  name: string
  path: string
  version: string
  error: string | null
  preferred?: boolean
}
export interface CliModel {
  model: string
  displayName: string
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[]
  defaultReasoningEffort: string | null
  isDefault: boolean
}
export interface CliCatalog {
  version?: string
  models: CliModel[]
  currentModel: string | null
  currentEffort: string | null
}
export interface CliConnectionReport {
  version: string
  modelReply: boolean
  model: string | null
  detail: string
}

export const cliApi = {
  testCli: (profile: AiProfile, requestId: string) =>
    invoke<CliConnectionReport>('ai_test_cli', { profile, requestId }),
  codexProbe: (path: string, requestId: string) =>
    invoke<string>('ai_codex_probe', { path, requestId }),
  scanCli: () => invoke<CliInstallation[]>('ai_cli_scan'),
  codexCatalog: (path: string) => invoke<CliCatalog>('ai_codex_catalog', { path }),
  codexModels: (path: string) => invoke<string[]>('ai_codex_models', { path }),
  inspectCodex: (path?: string) =>
    invoke<{ path: string; version: string }[]>('ai_codex_inspect', { path: path || null }),
}
