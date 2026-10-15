/** LIB-01 wire contract. No commands are exposed until their business implementation exists. */
export type RecordKind = 'text' | 'conversation' | 'draft';
export type InstantMs = number;
export type RecordDate = string; // Validated Gregorian YYYY-MM-DD, independent of timezone.
export type DocumentJson = { type: 'doc'; content?: unknown[] };
export interface RecordMetadata {
  id: string;
  kind: RecordKind;
  title: string | null;
  recordDate: RecordDate;
  createdTimezone: string;
  createdAt: InstantMs;
  updatedAt: InstantMs;
  currentRevisionId: string | null;
}
export interface SaveRecordRequest {
  recordId: string;
  baseRevisionId: string | null;
  requestId: string;
  sessionId: string;
  editSequence: number;
  title: string | null;
  recordDate: RecordDate;
  tagIds: string[];
  document: DocumentJson;
  attachmentIds: string[];
}
export interface SaveRecordResult {
  recordId: string;
  revisionId: string;
  requestId: string;
  sessionId: string;
  editSequence: number;
  savedAt: InstantMs;
}
export interface LibraryQuery {
  keyword: string;
  startDate: RecordDate | null;
  endDate: RecordDate | null;
  kinds: RecordKind[];
  tagIds: string[];
  tagMode: 'all' | 'any';
  hasImages: boolean | null;
  cursor: string | null;
  limit: number;
}
export type LibraryErrorCode =
  | 'validation' | 'conflict' | 'not_found' | 'storage_full'
  | 'write_failed' | 'corrupt_content' | 'cancelled';
export type LibraryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: LibraryErrorCode; message: string; currentRevisionId?: string } };
