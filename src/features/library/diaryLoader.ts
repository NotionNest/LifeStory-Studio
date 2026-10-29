import { searchApi, type ContentPreview } from '@/services/search'
import { recordsApi, type RecordFile, type RecoveryDraft } from '@/services/records'
import { desktopAvailable } from '@/services/desktop'
import type { LoaderFunctionArgs } from 'react-router'

export interface DiaryData {
  record: RecordFile | null
  draft: RecoveryDraft | null
  preview: ContentPreview | null
}
export async function diaryLoader({ params, request }: LoaderFunctionArgs): Promise<DiaryData> {
  if (!params.recordId) throw new Error('缺少日记标识')
  if (!desktopAvailable) return { record: null, draft: null, preview: null }
  const preview = await searchApi.preview(params.recordId)
  if (request.signal.aborted) throw request.signal.reason
  if (preview?.kind === 'conversation') return { record: null, draft: null, preview }
  const record = await recordsApi.read(params.recordId)
  const draft = await recordsApi.recovery(record.id)
  if (request.signal.aborted) throw request.signal.reason
  return { record, draft, preview: null }
}
