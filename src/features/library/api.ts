import { invoke } from '@tauri-apps/api/core'
import type { JSONContent } from '@tiptap/react'
export interface Tag { id: string; name: string }
export interface Attachment { id: string; name: string; mediaType: string; byteLength: number; width: number; height: number }
export interface AttachmentOperation { recordId: string; sessionId: string; expectedContentVersion: number; requestId: string }
export interface ImportReport { recordId: string; messages: string[]; retry: File[] }
export interface RecordFile {
  id: string; title: string | null; recordDate: string; createdTimezone: string
  createdAt: number; updatedAt: number; contentVersion: number; checkpointId: string; document: JSONContent; tags: Tag[]; attachments?: Attachment[]
}
export interface RecordSummary { id: string; title: string | null; recordDate: string; excerpt: string }
export type RecordKind = 'text' | 'conversation' | 'draft'
export interface LibraryQuery { keyword: string; dateFrom: string | null; dateTo: string | null; kinds: RecordKind[]; tagIds: string[]; tagMode: 'all' | 'any'; hasImages: boolean | null; month: string | null; offset: number }
export interface SearchItem extends RecordSummary {kind:RecordKind; tags:Tag[];hasImages:boolean;matchField:'title'|'body'|'message'|null}
export interface QueryPage {items:SearchItem[];total:number;nextOffset:number|null;days:{date:string;count:number}[];tags:Tag[]}
export interface ContentPreview {id:string;title:string|null;recordDate:string;kind:RecordKind;document:JSONContent|null;messages:string[];sources?:{id:string;title:string|null;unavailable:boolean}[]}
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
export interface DeleteImpact {recordId:string;title:string|null;contentVersion:number;impactToken:string;references:{id:string;title:string|null;kind:RecordKind}[]}
export interface TrashItem {id:string;title:string|null;kind:RecordKind;recordDate:string;deletedAt:number;purgeAt:number}
export interface TrashPage {items:TrashItem[];nextOffset:number|null;cleanupError:string|null}
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const libraryApi = {
  trashStatus:(recordId:string)=>invoke<'active'|'trash'|'missing'>('trash_status',{recordId}),
  trashImpact:(recordId:string)=>invoke<DeleteImpact>('trash_impact',{recordId}),
  trashMove:(impact:DeleteImpact)=>invoke<void>('trash_move',{input:{recordId:impact.recordId,expectedContentVersion:impact.contentVersion,expectedImpact:impact.impactToken}}),
  trashList:(offset=0,domain:'diary'|'chat'='diary')=>invoke<TrashPage>('trash_list',{offset,domain}),
  trashRestore:(item:TrashItem)=>invoke<void>('trash_restore',{recordId:item.id,deletedAt:item.deletedAt}),
  trashPurge:(item:TrashItem)=>invoke<void>('trash_purge',{recordId:item.id,deletedAt:item.deletedAt}),
  query: (query: LibraryQuery) => invoke<QueryPage>('library_query', {query}),
  preview: (recordId:string) => invoke<ContentPreview>('library_preview',{recordId}),
  importImage: async (operation: AttachmentOperation, file: File, document: object) => {
    if (file.size > MAX_IMAGE_BYTES) throw { code: 'validation', message: '图片超过 25 MiB' }
    const bytes = new Uint8Array(await file.slice(0, MAX_IMAGE_BYTES + 1).arrayBuffer())
    const metadata = new TextEncoder().encode(JSON.stringify({operation,name:file.name,document}))
    if(metadata.length>3*1024*1024) throw {code:'validation',message:'正文超过支持范围'}
    const packet=new Uint8Array(4+metadata.length+bytes.length)
    new DataView(packet.buffer).setUint32(0,metadata.length,true);packet.set(metadata,4);packet.set(bytes,4+metadata.length)
    return invoke<{ editing: EditingSession; attachmentId: string }>('attachment_import', packet)
  },
  image: (recordId: string, attachmentId: string, revisionId: string | null = null, original = false) => invoke<ArrayBuffer>('attachment_image', { recordId, attachmentId, revisionId, original }),
  copyImage: (recordId: string, attachmentId: string, revisionId: string | null) => invoke<void>('attachment_copy', {recordId,attachmentId,revisionId}),
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
