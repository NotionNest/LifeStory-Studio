import { invoke } from '@tauri-apps/api/core'
import type { ModelSelection } from './modelProfiles'
import type { AiTask } from './aiTasks'

export interface DiaryPreview {
  taskId: string
  text: string
  title: string
  recordDate: string
  mode: 'create' | 'append' | 'rewrite'
  targetId: string | null
  targetVersion: number | null
  adoptedId: string | null
  targetText?: string | null
  canUndo?: boolean
}

export const diaryPreviewsApi = {
  generatePreview: (input: {
    selection?: ModelSelection
    requestId: string
    recordId: string
    profileId: string
    mode: 'create' | 'append' | 'rewrite'
    targetId: string | null
    sourceIds: string[]
  }) => invoke<AiTask>('ai_preview_generate', { input }),
  preview: (taskId: string) => invoke<DiaryPreview>('ai_preview', { taskId }),
  undoAdoption: (taskId: string) => invoke<{ recordId: string }>('ai_undo_adoption', { taskId }),
  adopt: (input: {
    taskId: string
    requestId: string
    title: string
    recordDate: string
    text: string
  }) => invoke<{ recordId: string }>('ai_adopt', { input }),
}
