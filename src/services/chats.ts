import { invoke } from '@tauri-apps/api/core'
import type { ModelSelection } from './modelProfiles'
import type { AiTask } from './aiTasks'

export interface AiRelated {
  id: string
  title: string | null
  kind: 'text' | 'conversation' | 'draft'
  unavailable: boolean
  revisionId: string | null
}
export interface AiWorkspace {
  id: string
  title: string | null
  kind: string
  messages: {
    id: string
    role: string
    text: string
    images?: string[]
    sequence: number
    createdAt?: number
    reasoningSummary?: string | null
    durationMs?: number | null
  }[]
  sources: AiRelated[]
  related: AiRelated[]
  task: AiTask | null
  profileId?: string | null
  linkedDiaryId?: string | null
  adoptedSequence?: number
  previewTaskId?: string | null
  contextIds?: string[]
  effectiveModel?: string | null
  effectiveEffort?: string | null
}
export interface ChatSummary {
  id: string
  title: string | null
  updatedAt: number
  profileId: string | null
}

export const chatsApi = {
  chats: (keyword: string, offset = 0) =>
    invoke<{ items: ChatSummary[]; nextOffset: number | null }>('ai_chat_list', {
      keyword,
      offset,
    }),
  rename: (recordId: string, title: string) => invoke<void>('ai_chat_rename', { recordId, title }),
  send: (input: {
    selection?: ModelSelection
    requestId: string
    conversationId: string | null
    profileId: string
    text: string
    sourceIds: string[]
    recordDate: string
    timezone: string
  }) => invoke<AiTask>('ai_chat_send', { input }),
  importImage: async (recordId: string, file: File) => {
    if (file.size > 25 * 1024 * 1024) throw new Error('图片超过 25 MiB')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const metadata = new TextEncoder().encode(
      JSON.stringify({ recordId, requestId: crypto.randomUUID(), name: file.name }),
    )
    const packet = new Uint8Array(4 + metadata.length + bytes.length)
    new DataView(packet.buffer).setUint32(0, metadata.length, true)
    packet.set(metadata, 4)
    packet.set(bytes, 4 + metadata.length)
    return invoke<void>('ai_import_image', packet)
  },
  create: (recordDate: string, timezone: string) =>
    invoke<string>('ai_create_conversation', { recordDate, timezone }),
  workspace: (recordId: string) => invoke<AiWorkspace>('ai_workspace', { recordId }),
}
