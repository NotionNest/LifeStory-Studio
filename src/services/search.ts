import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
import type { RecordSummary, RecordKind } from './records'
import type { Tag } from './tags'

export interface LibraryQuery {
  keyword: string
  dateFrom: string | null
  dateTo: string | null
  kinds: RecordKind[]
  tagIds: string[]
  tagMode: 'all' | 'any'
  hasImages: boolean | null
  month: string | null
  offset: number
}
export interface SearchItem extends RecordSummary {
  kind: RecordKind
  tags: Tag[]
  hasImages: boolean
  matchField: 'title' | 'body' | 'message' | null
}
export interface QueryPage {
  items: SearchItem[]
  total: number
  nextOffset: number | null
  days: { date: string; count: number }[]
  tags: Tag[]
}
export interface CalendarDay {
  date: string
  count: number
  items: SearchItem[]
}
export interface CalendarPage {
  days: CalendarDay[]
  tags: Tag[]
}
export interface ContentPreview {
  id: string
  title: string | null
  recordDate: string
  kind: RecordKind
  document: JSONContent | null
  messages: string[]
  sources?: { id: string; title: string | null; unavailable: boolean }[]
}
export interface ChatSearchItem {
  chatId: string
  title: string | null
  messageId: string | null
  role: string | null
  excerpt: string
}

export const searchApi = {
  query: (query: LibraryQuery) => invoke<QueryPage>('library_query', { query }),
  calendar: (query: { filters: LibraryQuery; from: string; to: string }) =>
    invoke<CalendarPage>('library_calendar', { query }),
  preview: (recordId: string) => invoke<ContentPreview>('library_preview', { recordId }),
  searchChats: (keyword: string, offset = 0) =>
    invoke<{ items: ChatSearchItem[]; nextOffset: number | null }>('ai_chat_search', {
      keyword,
      offset,
    }),
}
