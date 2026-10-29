import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
import type { Attachment } from './attachments'
import type { Tag } from './tags'

export interface RecordFile {
  id: string
  title: string | null
  recordDate: string
  createdTimezone: string
  createdAt: number
  updatedAt: number
  contentVersion: number
  checkpointId: string
  document: JSONContent
  tags: Tag[]
  attachments?: Attachment[]
}
export interface RecordSummary {
  id: string
  title: string | null
  recordDate: string
  excerpt: string
}
export type RecordKind = 'text' | 'conversation' | 'draft'
export interface SaveInput {
  recordId: string
  baseCheckpointId: string
  baseContentVersion: number
  requestId: string
  sessionId: string
  editSequence: number
  title: string | null
  recordDate: string
  tagIds: string[]
  document: JSONContent
  attachmentIds: string[]
}
export interface SaveResult {
  recordId: string
  checkpointId: string
  contentVersion: number
  requestId: string
  sessionId: string
  editSequence: number
  savedAt: number
}
export interface RecoveryDraft {
  sessionId: string
  editSequence: number
  writtenAt: number
  input: SaveInput
  tags: Tag[]
}
export interface RecoverySummary {
  recordId: string
  title: string | null
  writtenAt: number
}
export interface RecoveryChoice {
  sessionId: string
  editSequence: number
  action: 'restore' | 'discard'
}
export interface EditingSession {
  record: RecordFile
  sessionId: string
  recovered: SaveInput | null
  recoveredTags: Tag[]
}

export const recordsApi = {
  recoveries: () => invoke<RecoverySummary[]>('recovery_list'),
  recovery: (recordId: string) => invoke<RecoveryDraft | null>('recovery_read', { recordId }),
  begin: (
    recordId: string,
    expectedContentVersion: number,
    recovery: RecoveryChoice | null = null,
  ) =>
    invoke<EditingSession>('record_begin_edit', {
      input: { recordId, expectedContentVersion, recovery },
    }),
  end: (recordId: string, sessionId: string) =>
    invoke<void>('record_end_edit', { recordId, sessionId }),
  create: (requestId: string, recordDate: string, createdTimezone: string) =>
    invoke<RecordFile>('record_create', { input: { requestId, recordDate, createdTimezone } }),
  read: (recordId: string) => invoke<RecordFile>('record_read', { recordId }),
  list: (offset = 0) => invoke<RecordSummary[]>('record_list', { offset }),
  save: (input: SaveInput) => invoke<SaveResult>('record_save', { input }),
  export: (input: SaveInput) => invoke<boolean>('record_export', { input }),
}

export const recordEvents = {
  onNewRequested: (handler: () => void) => listen('new-record-requested', handler),
  onSaveRequested: (handler: () => void) => listen('save-requested', handler),
}
