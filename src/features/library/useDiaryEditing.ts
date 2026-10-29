import { recordsApi, type EditingSession } from '@/services/records'
import { attachmentsApi, type AttachmentOperation } from '@/services/attachments'
import { trashApi, type DeleteImpact } from '@/services/trash'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { paths, diaryId } from '@/router/paths'
import { useLeaveStatus } from '@/contexts/LeaveProtectionContext'
import type { EditorHandle, ImportReport } from './RecordEditor'
import type { DiaryData } from './diaryLoader'
import { useDiaryLeaveProtection } from './useDiaryLeaveProtection'
import { errorMessage } from '@/lib/errors'

export function useDiaryEditing(data: DiaryData) {
  const navigate = useNavigate(),
    location = useLocation(),
    { recordId } = useParams()
  const openingStatus = useLeaveStatus(),
    operationStatus = useLeaveStatus(),
    tagStatus = useLeaveStatus()
  const [editing, setEditing] = useState<EditingSession | null>(null)
  // The keyed diary session opens once; loader revalidation must not replace an active editor.
  const [openingData] = useState(data)
  const [recovery, setRecovery] = useState(data.draft)
  const failure = useRef('')
  const [error, setError] = useState(''),
    [syncError, setSyncError] = useState('')
  const [working, setWorking] = useState(false),
    [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [attachmentSyncError, setAttachmentSyncError] = useState<{
    recordId: string
    message: string
  } | null>(null)
  const editor = useRef<EditorHandle>(null),
    history = useRef<{ canLeave: () => boolean } | null>(null)
  const initial = useRef<Promise<EditingSession> | null>(null),
    dirty = useRef(false),
    busy = useRef(false),
    operation = useRef(false),
    ended = useRef(false)
  const detailScroll = useRef<HTMLDivElement>(null),
    scroll = useRef(0)
  const record = editing?.record ?? data.record
  const isHistory = location.pathname.endsWith('/history')
  useEffect(() => {
    if (!openingData.record || openingData.draft) return
    let valid = true
    openingStatus.setBusy(true)
    initial.current ??= recordsApi.begin(openingData.record.id, openingData.record.contentVersion)
    void initial.current
      .then((value) => {
        if (valid) {
          setEditing(value)
          openingStatus.setBusy(false)
        }
      })
      .catch((cause) => {
        if (valid) {
          setError(errorMessage(cause))
          openingStatus.setBusy(false)
        }
      })
    return () => {
      valid = false
      openingStatus.setBusy(false)
    }
  }, [openingData, openingStatus])
  const applyEditing = (next: EditingSession) => {
    ended.current = false
    dirty.current = Boolean(next.recovered)
    setEditing(next)
    setSyncError('')
  }
  const run = async (action: () => Promise<void>) => {
    if (operation.current || busy.current) return
    operation.current = true
    operationStatus.setBusy(true)
    setWorking(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
      throw cause
    } finally {
      operation.current = false
      operationStatus.setBusy(false)
      setWorking(false)
    }
  }
  const prepare = async (to: string | null) => {
    if (operation.current || busy.current || attachmentSyncError || syncError || deleteImpact)
      throw new Error('请先完成日记中的当前操作或核对写入结果。')
    if (!history.current?.canLeave() && isHistory)
      throw new Error('历史写入结果尚未确认，请先完成核对。')
    if (editor.current && !ended.current) {
      if ((await editor.current.prepareLeave()) !== 'saved') {
        if (to?.split('?')[0] === paths.history(recordId!))
          throw new Error('当前修改尚未保存，请先处理保存错误，再查看历史。')
        return false
      }
      if (to && diaryId(to.split('?')[0]) === recordId) {
        scroll.current = detailScroll.current?.scrollTop ?? scroll.current
        if (to.split('?')[0] === paths.history(recordId!)) {
          const saved = await recordsApi.read(recordId!)
          if (saved.contentVersion !== editor.current.contentVersion())
            throw new Error('当前内容已变化，请重新读取日记后查看历史。')
          setEditing((old) => (old ? { ...old, record: saved } : old))
        } else editor.current.resume()
      } else if (editing) {
        await recordsApi.end(recordId!, editing.sessionId)
        ended.current = true
      }
    }
    return true
  }
  const reloadAfterChat = async () => {
    if (!record || !editor.current) return
    const current = await recordsApi.read(record.id)
    if (current.contentVersion !== editor.current.contentVersion()) {
      scroll.current = detailScroll.current?.scrollTop ?? 0
      applyEditing(await recordsApi.begin(record.id, current.contentVersion))
    }
    setSyncError('')
    editor.current?.resume()
  }
  const withSavedDiary = async (action: () => Promise<void>) =>
    run(async () => {
      if (isHistory || attachmentSyncError || syncError)
        throw new Error('请先完成日记中的当前操作。')
      if (editor.current && (await editor.current.prepareLeave()) !== 'saved') {
        editor.current.resume()
        throw new Error('日记尚未保存，请先处理保存错误。')
      }
      const refresh = async () => {
        try {
          await reloadAfterChat()
        } catch (cause) {
          setSyncError(errorMessage(cause))
          throw cause
        }
      }
      try {
        await action()
      } finally {
        await refresh()
      }
    })
  const releaseProtection = useDiaryLeaveProtection({
    canLeave: () => !isHistory || (history.current?.canLeave() ?? false),
    prepare,
    failureMessage: () => failure.current,
    exportUnsaved: async () => (await editor.current?.export()) ?? false,
    discard: async () => {
      const discarded = (await editor.current?.discard()) ?? true
      if (discarded) {
        ended.current = true
        dirty.current = false
      }
      return discarded
    },
    resume: () => {
      if (ended.current) void reread().catch(() => {})
      else editor.current?.resume()
    },
    resumeEditor: () => editor.current?.resume(),
    dirty: () => dirty.current || operation.current || Boolean(syncError || attachmentSyncError),
    withSavedDiary,
    save: () => {
      if (!isHistory) void editor.current?.save()
    },
  })
  useEffect(() => {
    if (isHistory) void editor.current?.prepareLeave()
    else editor.current?.resume()
  }, [isHistory, editing?.sessionId])
  const resolveRecovery = async (action: 'restore' | 'discard') =>
    run(async () => {
      if (!data.record || !recovery) return
      const next = await recordsApi.begin(data.record.id, data.record.contentVersion, {
        sessionId: recovery.sessionId,
        editSequence: recovery.editSequence,
        action,
      })
      applyEditing(next)
      setRecovery(null)
    })
  const knownFailure = (cause: unknown) =>
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    [
      'validation',
      'not_found',
      'storage_busy',
      'storage_full',
      'storage_permission',
      'storage_corrupt',
      'storage_interrupted',
      'corrupt_content',
    ].includes(String(cause.code))
  const importImages = async (files: File[], position: number) =>
    run(async () => {
      if (!record || !editing || !editor.current || isHistory)
        throw new Error('目标记录已变化，请在原记录中重新选择图片。')
      if ((await editor.current.prepareLeave()) !== 'saved') {
        setImportReport({
          recordId: record.id,
          messages: ['尚未导入：当前修改保存失败。'],
          retry: files,
        })
        throw new Error('当前修改尚未保存，请先处理保存错误。')
      }
      try {
        const saved = await recordsApi.read(record.id)
        if (saved.contentVersion !== editor.current.contentVersion())
          throw new Error('当前内容已变化，请重新打开记录核对图片。')
        let next: EditingSession = { ...editing, record: saved }
        const operation = (): AttachmentOperation => ({
          recordId: record.id,
          expectedContentVersion: next.record.contentVersion,
          sessionId: next.sessionId,
          requestId: crypto.randomUUID(),
        })
        const messages: string[] = [],
          retry: File[] = []
        setImportReport({ recordId: record.id, messages: ['正在插入图片…'], retry: [] })
        for (let index = 0; index < files.length; index++) {
          const file = files[index]
          try {
            const input = operation(),
              document = editor.current.imageDocument(input.requestId, position)
            const result = await attachmentsApi.importImage(input, file, document)
            next = result.editing
            position = editor.current.acceptImage(next, result.attachmentId, position)
            setEditing(next)
          } catch (cause) {
            if (knownFailure(cause)) {
              messages.push(`未成功：${file.name} · ${errorMessage(cause)}`)
              retry.push(file)
            } else {
              messages.push(
                `结果尚未确认：${file.name} · ${errorMessage(cause)}。请核对正文，避免重复插入。`,
              )
              try {
                const current = await recordsApi.read(record.id)
                next = await recordsApi.begin(record.id, current.contentVersion)
                applyEditing(next)
              } catch (readError) {
                setAttachmentSyncError({ recordId: record.id, message: errorMessage(readError) })
              }
              for (const remaining of files.slice(index + 1)) {
                retry.push(remaining)
                messages.push(`尚未处理：${remaining.name}`)
              }
              break
            }
          }
        }
        setImportReport({ recordId: record.id, messages, retry })
      } finally {
        editor.current?.resume()
      }
    })
  const remove = async () =>
    run(async () => {
      if (editor.current && (await editor.current.prepareLeave()) !== 'saved')
        throw new Error('当前修改尚未保存，请先处理保存错误。')
      setDeleteImpact(await trashApi.trashImpact(recordId!))
    })
  const reread = async () =>
    run(async () => {
      const current = await recordsApi.read(recordId!)
      applyEditing(await recordsApi.begin(recordId!, current.contentVersion))
      setAttachmentSyncError(null)
      setSyncError('')
    })
  return {
    views: {
      editor: {
        record,
        sessionId: editing?.sessionId,
        working,
        blocked: Boolean(syncError || attachmentSyncError || deleteImpact),
        viewport: detailScroll,
        restoreScroll: () => {
          if (detailScroll.current) detailScroll.current.scrollTop = scroll.current
        },
        rememberScroll: (viewport: HTMLDivElement) => {
          scroll.current = viewport.scrollTop
        },
        requestDelete: remove,
      },
      history: {
        record,
        sessionId: editing?.sessionId,
        controller: history,
        restored: (next: EditingSession) => {
          applyEditing(next)
          setError('')
        },
      },
    },
    editorBinding: editing
      ? {
          ref: editor,
          record: editing.record,
          sessionId: editing.sessionId,
          recovered: editing.recovered,
          recoveredTags: editing.recoveredTags,
          onDirty: (value: boolean) => {
            dirty.current = value
          },
          onBusy: (value: boolean) => {
            busy.current = value
            tagStatus.setBusy(value)
          },
          onSaved: () => setError(''),
          onFailure: (value: string) => {
            failure.current = value
            setError(value)
          },
          onImport: (files: File[], position: number) =>
            void importImages(files, position).catch(() => {}),
          importReport,
        }
      : null,
    feedback: { error, syncError, attachmentSyncError, deleteImpact, working, recovery },
    actions: {
      reread,
      resolveRecovery,
      clearError: () => setError(''),
      closeDelete: () => {
        setDeleteImpact(null)
        editor.current?.resume()
      },
      deleted: () => {
        setDeleteImpact(null)
        releaseProtection()
        void navigate(paths.diaries, { replace: true })
      },
    },
  }
}
