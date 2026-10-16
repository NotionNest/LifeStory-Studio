import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
export interface Tag { id: string; name: string }
export interface RecordFile {
  id: string; title: string | null; recordDate: string; createdTimezone: string
  createdAt: number; updatedAt: number; revisionId: string; document: JSONContent; tags: Tag[]
}
export interface RecordSummary { id: string; title: string | null; recordDate: string; excerpt: string }
export interface SaveInput {
  recordId: string; baseRevisionId: string; requestId: string; sessionId: string; editSequence: number
  title: string | null; recordDate: string; tagIds: string[]; document: JSONContent; attachmentIds: string[]
}
export interface SaveResult {
  recordId: string; revisionId: string; requestId: string; sessionId: string; editSequence: number; savedAt: number
}
export const libraryApi = {
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
