import { invoke } from '@tauri-apps/api/core'

export interface AiTask {
  id: string
  recordId: string
  status: string
  partial: string
  reasoningSummary?: string
  startedAt?: number
  updatedAt?: number
  error: string | null
  resultId: string | null
}

export const aiTasksApi = {
  task: (taskId: string) => invoke<AiTask>('ai_task', { taskId }),
  start: (input: {
    requestId: string
    recordId: string
    profileId: string
    kind: string
    text: string
    sourceIds: string[]
  }) => invoke<AiTask>('ai_start', { input }),
  retrySave: (taskId: string) => invoke<void>('ai_retry_save', { taskId }),
  cancel: (taskId: string) => invoke<void>('ai_cancel', { taskId }),
  compare: (ownerId: string, sourceId: string, revisionId: string) =>
    invoke<string>('ai_compare', { ownerId, sourceId, revisionId }),
}
