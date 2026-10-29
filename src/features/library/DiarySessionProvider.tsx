import { Outlet, useNavigate } from 'react-router'
import { paths } from '@/router/paths'
import { Button } from '@/components/ui/button'
import { DeleteRecordDialog } from '@/components/dialogs/DeleteRecordDialog'
import { AttachmentSync } from './ImageImportSync'
import { RecoveryPreview } from './RecoveryPreview'
import { LibraryContentPreview } from './LibraryContentPreview'
import { RecordEditorSession } from './RecordEditor'
import { DiarySessionContext } from './DiarySessionContext'
import { useDiaryEditing } from './useDiaryEditing'
import type { DiaryData } from './diaryLoader'

export function DiarySessionProvider({ data }: { data: DiaryData }) {
  const { views, editorBinding, feedback, actions } = useDiaryEditing(data)
  const { error, syncError, attachmentSyncError, deleteImpact, working, recovery } = feedback
  const { reread, resolveRecovery } = actions
  const navigate = useNavigate()
  const content = (
    <DiarySessionContext value={views}>
      {error && (
        <p role="alert" className="border-b px-6 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {syncError && (
        <div role="alert" className="border-b px-6 py-3 text-sm text-destructive">
          {syncError}
          <Button variant="ghost" disabled={working} onClick={() => void reread().catch(() => {})}>
            重新读取日记
          </Button>
        </div>
      )}
      {data.preview ? (
        <section className="flex h-full min-h-0 flex-col">
          <header className="workspace-toolbar">
            <Button variant="ghost" size="sm" onClick={() => void navigate(paths.diaries)}>
              返回日记
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LibraryContentPreview content={data.preview} />
          </div>
        </section>
      ) : editorBinding ? (
        <Outlet />
      ) : !recovery ? (
        <p role="status" className="p-8">
          {error ? '日记尚未打开，请返回后重试。' : '正在打开日记…'}
        </p>
      ) : null}
      {attachmentSyncError && (
        <AttachmentSync
          busy={working}
          error={attachmentSyncError.message}
          onReread={() => void reread().catch(() => {})}
        />
      )}
      {deleteImpact && (
        <DeleteRecordDialog
          impact={deleteImpact}
          onClose={actions.closeDelete}
          onDeleted={actions.deleted}
        />
      )}
      {recovery && data.record && (
        <RecoveryPreview
          record={data.record}
          draft={recovery}
          busy={working}
          error={error}
          onChoose={(action) => void resolveRecovery(action).catch(() => {})}
          onCancel={() => void navigate(paths.diaries)}
          onRefresh={() =>
            void reread()
              .then(actions.clearError)
              .catch(() => {})
          }
        />
      )}
    </DiarySessionContext>
  )
  if (!editorBinding) return content
  return (
    <RecordEditorSession key={editorBinding.sessionId} {...editorBinding}>
      {content}
    </RecordEditorSession>
  )
}
