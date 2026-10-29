import { invoke } from '@tauri-apps/api/core'

export interface AiProfile {
  hasKey?: boolean
  keyScope?: Record<string, string | null> | null
  id: string
  label: string
  service: string
  protocol: string
  baseUrl: string
  model: string
  contextChars: number
  maxOutputTokens: number
  downstream: string | null
  codexPath: string | null
  outputTokenParameter?: string | null
  cliModelMode?: 'inherit' | 'selected' | 'custom' | null
  reasoningEffort?: string | null
  cliVersion?: string | null
}
export interface ModelSelection {
  model: string | null
  reasoningEffort: string | null
}
export interface AiPreferences {
  defaultProfileId: string | null
  checks?: { profileId: string; testedAt: number; textStreaming: boolean; error: string | null }[]
}

export const modelProfilesApi = {
  cancelTest: (requestId: string) => invoke<void>('ai_cancel_test', { requestId }),
  updateProfile: (profile: AiProfile, key: string, useForNewChat?: boolean) =>
    invoke<AiProfile>('ai_update_profile', {
      profile,
      key,
      ...(useForNewChat === undefined ? {} : { useForNewChat }),
    }),
  preferences: () => invoke<AiPreferences>('ai_preferences'),
  setDefault: (profileId: string | null) => invoke<void>('ai_set_default', { profileId }),
  models: (profileId: string) => invoke<string[]>('ai_models', { profileId }),
  modelsDraft: (profile: AiProfile, key: string) => invoke<string[]>('ai_models', { profile, key }),
  profiles: () => invoke<AiProfile[]>('ai_profiles'),
  configure: (profile: AiProfile, key: string, useForNewChat?: boolean) =>
    invoke<AiProfile>('ai_configure', {
      profile,
      key,
      ...(useForNewChat === undefined ? {} : { useForNewChat }),
    }),
  removeProfile: (profileId: string) => invoke<void>('ai_delete_profile', { profileId }),
  test: (profileId: string, requestId = crypto.randomUUID()) =>
    invoke<void>('ai_test', { profileId, requestId }),
}
