import {
  recordsApi,
  type RecordFile,
  type SaveInput,
  type EditingSession,
} from '@/services/records'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { errorMessage } from '@/lib/errors'
import { imageIds } from './imageDocument'
export type FlushResult = 'saved' | 'failed'
interface Options {
  record: RecordFile
  sessionId: string
  recovered?: SaveInput | null
  editor: Editor | null
  content: () => Pick<SaveInput, 'title' | 'recordDate' | 'tagIds' | 'document'>
  onDirty: (value: boolean) => void
  onSaved: () => void
  onFailure: (message: string) => void
}
export function useRecordPersistence(options: Options) {
  const latest = useRef(options)
  latest.current = options
  const [status, setStatus] = useState(
    options.recovered
      ? '正在保存恢复内容…'
      : options.record.recordDate
        ? '已保存到本机'
        : '已保存到本机 · 日期待补充',
  )
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const sequence = useRef(options.recovered ? 1 : 0),
    saved = useRef(0)
  const session = useRef(options.sessionId)
  const version = useRef(options.record.contentVersion),
    checkpoint = useRef(options.record.checkpointId)
  const pending = useRef<SaveInput | null>(null),
    inFlight = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true),
    composing = useRef(false),
    failed = useRef(false)
  const failureKind = useRef(''),
    retries = useRef(0),
    retryAt = useRef(0)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    maximum = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const actions = useRef({ save: async () => false })
  const clear = () => {
    clearTimeout(idle.current)
    clearTimeout(maximum.current)
    idle.current = undefined
    maximum.current = undefined
  }
  const snapshot = (): SaveInput => ({
    ...latest.current.content(),
    recordId: options.record.id,
    sessionId: session.current,
    baseContentVersion: version.current,
    baseCheckpointId: checkpoint.current,
    editSequence: sequence.current,
    requestId: crypto.randomUUID(),
    attachmentIds: imageIds(latest.current.content().document),
  })
  const clearRetry = () => {
    clearTimeout(retry.current)
    retry.current = undefined
  }
  const schedule = () => {
    if (!mounted.current || failed.current || sequence.current <= saved.current) return
    if (retryAt.current) {
      clear()
      if (!retry.current && !composing.current) {
        const timer = setTimeout(
          () => {
            void waitForComposition().then((active) => {
              if (retry.current !== timer) return
              retry.current = undefined
              if (active && !failed.current) void actions.current.save()
            })
          },
          Math.max(0, retryAt.current - Date.now()),
        )
        retry.current = timer
      }
      return
    }
    if (composing.current) return
    clearTimeout(idle.current)
    idle.current = setTimeout(() => {
      clear()
      void actions.current.save()
    }, 800)
    maximum.current ??= setTimeout(() => {
      clear()
      void actions.current.save()
    }, 2000)
  }
  const waitForComposition = async () => {
    while (mounted.current && (composing.current || latest.current.editor?.view.composing)) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return mounted.current
  }
  const changed = () => {
    // Correcting validation may resume saving; editing cannot bypass storage backoff or conflicts.
    if (failureKind.current === 'validation') {
      failed.current = false
      failureKind.current = ''
    }
    sequence.current++
    setStatus('未保存')
    latest.current.onDirty(true)
    schedule()
  }
  const save = (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current
    if (!latest.current.editor || composing.current || latest.current.editor.view.composing)
      return Promise.resolve(false)
    clear()
    clearRetry()
    if (sequence.current === saved.current && !pending.current) return Promise.resolve(true)
    failed.current = false
    setBusy(true)
    setError('')
    setStatus('保存中…')
    const operation = Promise.resolve().then(async () => {
      const input = pending.current ?? snapshot()
      pending.current = input
      try {
        const result = await recordsApi.save(input)
        version.current = result.contentVersion
        checkpoint.current = result.checkpointId
        pending.current = null
        saved.current = input.editSequence
        failed.current = false
        failureKind.current = ''
        retries.current = 0
        retryAt.current = 0
        const clean = sequence.current === saved.current
        if (mounted.current) {
          setStatus(
            clean
              ? latest.current.content().recordDate
                ? '已保存到本机'
                : '已保存到本机 · 日期待补充'
              : '正在保存新修改…',
          )
          latest.current.onDirty(!clean)
          latest.current.onSaved()
        }
        return clean
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause
            ? String(cause.code)
            : 'unknown'
        if (['conflict', 'validation', 'not_found'].includes(code)) pending.current = null
        failureKind.current = code
        const retryable = code === 'storage_busy' || code === 'storage_interrupted'
        failed.current = !retryable
        retryAt.current = retryable
          ? Date.now() + Math.min(1000 * 2 ** retries.current++, 30000)
          : 0
        if (mounted.current) {
          const message = `${errorMessage(cause)}。${retryable ? '将自动重试，内容仍保留。' : code === 'validation' ? '修改内容后继续保存。' : '请处理问题后重试，当前内容仍保留。'}`
          setError(message)
          setStatus('保存未完成')
          latest.current.onDirty(true)
          latest.current.onFailure(message)
        }
        return false
      } finally {
        inFlight.current = null
        if (mounted.current) {
          setBusy(false)
          if (sequence.current > saved.current) schedule()
        }
      }
    })
    inFlight.current = operation
    return operation
  }
  actions.current = { save }
  const flush = async (): Promise<FlushResult> => {
    // A successful older write is not a failure: drain newer edits before leaving.
    if (!latest.current.editor) return 'failed'
    while (mounted.current) {
      if (!(await waitForComposition())) return 'failed'
      const clean = await save()
      if (clean) return 'saved'
      if (failureKind.current) return 'failed'
    }
    return 'failed'
  }
  const discard = async () => {
    clear()
    clearRetry()
    failed.current = true
    try {
      await recordsApi.end(options.record.id, session.current)
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      latest.current.onFailure(errorMessage(cause))
      return false
    }
  }
  const compositionStart = () => {
    composing.current = true
    clear()
  }
  const compositionEnd = () => {
    composing.current = false
    schedule()
  }
  useEffect(() => {
    mounted.current = true
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void actions.current.save()
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      mounted.current = false
      clear()
      clearRetry()
      window.removeEventListener('keydown', key)
    }
  }, [])
  const onEditorReady = useEffectEvent(() => {
    if (options.recovered) {
      latest.current.onDirty(true)
      schedule()
    }
  })
  useEffect(() => {
    if (options.editor) onEditorReady()
  }, [options.editor])
  const acceptImage = (editing: EditingSession) => {
    clear()
    clearRetry()
    pending.current = null
    session.current = editing.sessionId
    version.current = editing.record.contentVersion
    checkpoint.current = editing.record.checkpointId
    saved.current = sequence.current
    failed.current = false
    failureKind.current = ''
    retryAt.current = 0
    setStatus('已保存到本机')
    latest.current.onDirty(false)
    latest.current.onSaved()
  }
  return {
    acceptImage,
    waitForComposition,
    status,
    error,
    busy,
    changed,
    save,
    flush,
    discard,
    snapshot,
    compositionStart,
    compositionEnd,
  }
}
