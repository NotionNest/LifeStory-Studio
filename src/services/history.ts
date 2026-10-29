import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
import type { EditingSession } from './records'
import type { Tag } from './tags'

export interface HistoryCursor {
  createdAt: number
  id: string
}
export interface HistorySummary {
  id: string
  createdAt: number
  important: boolean
  referenced: boolean
  currentCheckpoint: boolean
  restorable: boolean
  restoredFromId: string | null
  excerpt: string
}
export interface HistorySnapshot {
  document: JSONContent
  title: string | null
  recordDate: string
  tags: Tag[]
}
export interface HistoryVersion {
  summary: HistorySummary
  document: JSONContent
  snapshot: HistorySnapshot | null
}
export interface HistoryPage {
  items: HistorySummary[]
  nextBefore: HistoryCursor | null
}
export interface RestoreHistory {
  recordId: string
  revisionId: string
  expectedContentVersion: number
  sessionId: string
  requestId: string
}

export const historyApi = {
  history: (recordId: string, before: HistoryCursor | null = null) =>
    invoke<HistoryPage>('history_list', { recordId, before }),
  version: (recordId: string, revisionId: string) =>
    invoke<HistoryVersion>('history_read', { recordId, revisionId }),
  mark: (recordId: string, revisionId: string, important: boolean) =>
    invoke<void>('history_mark', { recordId, revisionId, important }),
  restore: (input: RestoreHistory) => invoke<EditingSession>('history_restore', { input }),
}
