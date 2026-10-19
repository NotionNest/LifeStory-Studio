import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
export interface Tag { id: string; name: string }
export interface RecordFile {
  id: string; title: string | null; recordDate: string; createdTimezone: string
  createdAt: number; updatedAt: number; contentVersion: number; checkpointId: string; document: JSONContent; tags: Tag[]
}
export interface RecordSummary { id: string; title: string | null; recordDate: string; excerpt: string }
export interface SaveInput {
  recordId: string; baseCheckpointId: string; baseContentVersion: number; requestId: string; sessionId: string; editSequence: number
  title: string | null; recordDate: string; tagIds: string[]; document: JSONContent; attachmentIds: string[]
}
export interface SaveResult {
  recordId: string; checkpointId: string; contentVersion: number; requestId: string; sessionId: string; editSequence: number; savedAt: number
}
export interface RecoveryDraft { sessionId: string; editSequence: number; writtenAt: number; input: SaveInput; tags: Tag[] }
export interface RecoverySummary { recordId: string; title: string | null; writtenAt: number }
export interface RecoveryChoice { sessionId: string; editSequence: number; action: 'restore' | 'discard' }
export interface EditingSession { record: RecordFile; sessionId: string; recovered: SaveInput | null; recoveredTags: Tag[] }
export interface HistoryCursor { createdAt: number; id: string }
export interface HistorySummary {
  id: string; createdAt: number; important: boolean; referenced: boolean
  currentCheckpoint: boolean; restorable: boolean; restoredFromId: string | null; excerpt: string
}
export interface HistorySnapshot { document: JSONContent; title: string | null; recordDate: string; tags: Tag[] }
export interface HistoryVersion { summary: HistorySummary; document: JSONContent; snapshot: HistorySnapshot | null }
export interface HistoryPage { items: HistorySummary[]; nextBefore: HistoryCursor | null }
export interface RestoreHistory { recordId: string; revisionId: string; expectedContentVersion: number; sessionId: string; requestId: string }
export const libraryApi = {
  history: (recordId: string, before: HistoryCursor | null = null) => invoke<HistoryPage>('history_list', { recordId, before }),
  version: (recordId: string, revisionId: string) => invoke<HistoryVersion>('history_read', { recordId, revisionId }),
  mark: (recordId: string, revisionId: string, important: boolean) => invoke<void>('history_mark', { recordId, revisionId, important }),
  restore: (input: RestoreHistory) => invoke<EditingSession>('history_restore', { input }),
  recoveries: () => invoke<RecoverySummary[]>('recovery_list'),
  recovery: (recordId: string) => invoke<RecoveryDraft | null>('recovery_read', { recordId }),
  begin: (recordId: string, expectedContentVersion: number, recovery: RecoveryChoice | null = null) => invoke<EditingSession>('record_begin_edit', { input: { recordId, expectedContentVersion, recovery } }),
  end: (recordId: string, sessionId: string) => invoke<void>('record_end_edit', { recordId, sessionId }),
  create: (requestId: string, recordDate: string, createdTimezone: string) => invoke<RecordFile>('record_create', { input: { requestId, recordDate, createdTimezone } }),
  read: (recordId: string) => invoke<RecordFile>('record_read', { recordId }),
  list: (offset = 0) => invoke<RecordSummary[]>('record_list', { offset }),
  save: (input: SaveInput) => invoke<SaveResult>('record_save', { input }),
  tag: (name: string) => invoke<Tag>('tag_create', { name }),
  export: (input: SaveInput) => invoke<boolean>('record_export', { input }),
  exit: () => invoke<void>('record_exit'),
}
export function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error)
}
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
