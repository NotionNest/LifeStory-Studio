import type { AiWorkspace } from '@/services/chats'
import type { AiTask } from '@/services/aiTasks'
import type { ModelSelection } from '@/services/modelProfiles'
import { diaryPreviewsApi, type DiaryPreview } from '@/services/diaryPreviews'
import { aiTasksApi } from '@/services/aiTasks'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { errorMessage } from '@/lib/errors'
import { localDate } from '@/lib/localDate'
import type { PreviewMode } from './chatTypes'
interface Options {
  id: string | null
  active: boolean
  previewId: string | null
  task: AiTask | null | undefined
  profileId: string | undefined
  hasPending(): boolean
  target: string | null
  selection: ModelSelection | undefined
  sources: string[]
  run(action: () => Promise<void>): Promise<void>
  savedDiaryAction(action: () => Promise<void>): Promise<void>
  refresh(): Promise<void>
  refreshChats(offset?: number): Promise<void>
  showChat(chat: string | null, previewId?: string): void
  reportError(message: string): void
  onDiaryChanged(id: string, message: string): void
  isCurrent(id: string | null): boolean
  currentChat(): string | null
}
export function useChatPreview({
  id,
  active,
  previewId,
  task,
  profileId,
  hasPending,
  target,
  selection,
  sources,
  run,
  savedDiaryAction,
  refresh,
  refreshChats,
  showChat,
  reportError,
  onDiaryChanged,
  isCurrent,
  currentChat,
}: Options) {
  const [preview, setPreview] = useState<DiaryPreview | null>(null)
  const [previewText, setPreviewText] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDate, setPreviewDate] = useState(localDate())
  const [previewDirty, setPreviewDirty] = useState(false)
  const [verifiedPreview, setVerifiedPreview] = useState<string | null>(null)
  const previewRequest = useRef<string | null>(null),
    adoptRequest = useRef<string | null>(null),
    previewEpoch = useRef(0)
  const previewCache = useRef(
    new Map<
      string,
      { value: DiaryPreview; text: string; title: string; date: string; dirty: boolean }
    >(),
  )
  useEffect(
    () => () => {
      previewEpoch.current += 1
    },
    [],
  )
  const updatePreview = useCallback(
    (value: DiaryPreview) => {
      setPreview(value)
      setPreviewText(value.text)
      setPreviewTitle(value.title)
      setPreviewDate(value.recordDate)
      setPreviewDirty(false)
      adoptRequest.current = null
    },
    [setPreview, setPreviewText, setPreviewTitle, setPreviewDate, setPreviewDirty, adoptRequest],
  )
  const onPreviewReady = useEffectEvent((record: string | null, taskId: string) => {
    if (active) showChat(record, taskId)
  })
  useEffect(() => {
    if (id && isCurrent(id) && preview && verifiedPreview === `${id}:${preview.taskId}`)
      previewCache.current.set(id, {
        value: preview,
        text: previewText,
        title: previewTitle,
        date: previewDate,
        dirty: previewDirty,
      })
  }, [
    id,
    preview,
    previewText,
    previewTitle,
    previewDate,
    previewDirty,
    verifiedPreview,
    isCurrent,
    previewCache,
  ])
  useEffect(() => {
    if (task?.status === 'completed' && previewRequest.current === task.id) {
      previewRequest.current = null
      const epoch = previewEpoch.current
      const record = currentChat()
      void diaryPreviewsApi
        .preview(task.id)
        .then((p) => {
          if (epoch === previewEpoch.current && isCurrent(record)) {
            previewCache.current.set(record!, {
              value: p,
              text: p.text,
              title: p.title,
              date: p.recordDate,
              dirty: false,
            })
            onPreviewReady(record, p.taskId)
          }
        })
        .catch((e) => {
          if (epoch === previewEpoch.current && isCurrent(record)) reportError(errorMessage(e))
        })
      void refreshChats()
    }
  }, [
    task?.status,
    task?.id,
    refreshChats,
    previewRequest,
    previewEpoch,
    isCurrent,
    currentChat,
    previewCache,
    reportError,
  ])
  useEffect(() => {
    if (!active) return
    setVerifiedPreview(null)
    if (!previewId) {
      setPreview(null)
      setPreviewDirty(false)
      return
    }
    setPreview(null)
    let valid = true
    const taskId = previewId
    const chatId = id
    void Promise.all([diaryPreviewsApi.preview(taskId), aiTasksApi.task(taskId)])
      .then(([value, task]) => {
        if (!valid) return
        if (!chatId || task.recordId !== chatId) throw new Error('预览不属于当前聊天。')
        setVerifiedPreview(`${chatId}:${taskId}`)
        const cached = previewCache.current.get(chatId)
        if (cached?.value.taskId === taskId && !value.adoptedId) {
          setPreview(value)
          setPreviewText(cached.text)
          setPreviewTitle(cached.title)
          setPreviewDate(cached.date)
          setPreviewDirty(cached.dirty)
        } else updatePreview(value)
      })
      .catch((e) => {
        if (valid) {
          setPreview(null)
          reportError(errorMessage(e))
        }
      })
    return () => {
      valid = false
    }
  }, [
    active,
    id,
    previewId,
    setVerifiedPreview,
    setPreview,
    setPreviewDirty,
    previewCache,
    setPreviewText,
    setPreviewTitle,
    setPreviewDate,
    updatePreview,
    reportError,
  ])
  const generate = (choice: PreviewMode) =>
    run(async () => {
      if (!id || !profileId) return
      if (hasPending()) throw new Error('请先处理待发送消息')
      const targetId = choice === 'create' ? null : target
      if (choice !== 'create' && !targetId) throw new Error('请先选择要补充的日记')
      let result!: Awaited<ReturnType<typeof diaryPreviewsApi.generatePreview>>
      await savedDiaryAction(async () => {
        result = await diaryPreviewsApi.generatePreview({
          ...(selection ? { selection } : {}),
          requestId: crypto.randomUUID(),
          recordId: id!,
          profileId,
          mode: choice,
          targetId,
          sourceIds: sources,
        })
      })
      setPreview(null)
      setPreviewDirty(false)
      previewRequest.current = result.id
      showChat(id)
      await refresh()
    })
  const adopt = () =>
    run(async () => {
      if (!preview || preview.taskId !== previewId || verifiedPreview !== `${id}:${preview.taskId}`)
        return
      adoptRequest.current ??= crypto.randomUUID()
      let result!: Awaited<ReturnType<typeof diaryPreviewsApi.adopt>>
      await savedDiaryAction(async () => {
        result = await diaryPreviewsApi.adopt({
          taskId: preview.taskId,
          requestId: adoptRequest.current!,
          title: previewTitle,
          recordDate: previewDate,
          text: previewText,
        })
      })
      setPreview(await diaryPreviewsApi.preview(preview.taskId))
      setPreviewDirty(false)
      onDiaryChanged(result.recordId, '日记已保存。聊天仍独立保留。')
      await refresh()
      void refreshChats()
    })
  const closePreview = () => {
    if (id)
      previewCache.current.set(id, {
        value: preview!,
        text: previewText,
        title: previewTitle,
        date: previewDate,
        dirty: previewDirty,
      })
    setPreview(null)
    setPreviewDirty(false)
    showChat(id)
  }
  const returnToChat = () => showChat(id)
  const changeTitle = (value: string) => {
    setPreviewTitle(value)
    setPreviewDirty(true)
    adoptRequest.current = null
  }
  const changeDate = (value: string) => {
    setPreviewDate(value)
    setPreviewDirty(true)
    adoptRequest.current = null
  }
  const changeText = (value: string) => {
    setPreviewText(value)
    setPreviewDirty(true)
    adoptRequest.current = null
  }
  const undoAdoption = () =>
    void run(async () => {
      let result!: Awaited<ReturnType<typeof diaryPreviewsApi.undoAdoption>>
      await savedDiaryAction(async () => {
        result = await diaryPreviewsApi.undoAdoption(preview!.taskId)
      })
      updatePreview(await diaryPreviewsApi.preview(preview!.taskId))
      onDiaryChanged(result.recordId, '本次修改已撤销，日记恢复到采用前内容。')
    })
  const reconcileWorkspace = async (
    chatId: string,
    workspace: AiWorkspace,
    isValid: () => boolean,
  ): Promise<boolean> => {
    const cached = previewCache.current.get(chatId)
    const candidate = workspace.previewTaskId ?? cached?.value.taskId
    if (candidate) {
      try {
        const server = await diaryPreviewsApi.preview(candidate)
        if (!isValid()) return false
        const keep = cached && cached.value.taskId === candidate && !server.adoptedId
        previewCache.current.set(chatId, {
          value: server,
          text: keep ? cached.text : server.text,
          title: keep ? cached.title : server.title,
          date: keep ? cached.date : server.recordDate,
          dirty: keep ? cached.dirty : false,
        })
      } catch (e) {
        if (isValid()) {
          previewCache.current.delete(chatId)
          if (previewId === candidate) {
            setVerifiedPreview(null)
            setPreview(null)
            setPreviewDirty(false)
          }
          reportError(errorMessage(e))
        }
      }
    }
    return isValid()
  }
  const stash = (chatId: string | null) => {
    if (chatId && preview)
      previewCache.current.set(chatId, {
        value: preview,
        text: previewText,
        title: previewTitle,
        date: previewDate,
        dirty: previewDirty,
      })
  }
  const reset = () => {
    previewEpoch.current += 1
    setPreview(null)
    setPreviewDirty(false)
    setVerifiedPreview(null)
    adoptRequest.current = null
    previewRequest.current = null
  }
  return {
    view: {
      preview,
      previewText,
      previewTitle,
      previewDate,
      verified:
        !!preview && preview.taskId === previewId && verifiedPreview === `${id}:${preview.taskId}`,
    },
    pending: Boolean(previewRequest.current),
    lifecycle: {
      stash,
      reset,
      reconcileWorkspace,
      forget: (chatId: string) => previewCache.current.delete(chatId),
      cachedTaskId: (chatId: string) => previewCache.current.get(chatId)?.value.taskId,
      hasDrafts: () => previewDirty || [...previewCache.current.values()].some((p) => p.dirty),
    },
    actions: {
      generate,
      adopt,
      closePreview,
      returnToChat,
      changeTitle,
      changeDate,
      changeText,
      undoAdoption,
    },
  }
}
