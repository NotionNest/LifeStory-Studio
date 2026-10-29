import { chatsApi } from '@/services/chats'
import { aiTasksApi, type AiTask } from '@/services/aiTasks'
import type { ModelSelection } from '@/services/modelProfiles'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { errorMessage } from '@/lib/errors'
import { localDate } from '@/lib/localDate'
import type { QueuedMessage } from './chatTypes'
interface Options {
  id: string | null
  canDispatch: boolean
  previewPending: boolean
  running: boolean
  task: AiTask | null | undefined
  profileId: string | undefined
  text: string
  sources: string[]
  selection: ModelSelection | undefined
  isBusy(): boolean
  clearInput(): void
  onSent(task: AiTask, queued: boolean): Promise<void>
  run(action: () => Promise<void>): Promise<void>
  savedDiaryAction(action: () => Promise<void>): Promise<void>
  refresh(): Promise<void>
}
export function useChatQueue({
  id,
  canDispatch,
  previewPending,
  running,
  task,
  profileId,
  text,
  sources,
  selection,
  isBusy,
  clearInput,
  onSent,
  run,
  savedDiaryAction,
  refresh,
}: Options) {
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const sendRequest = useRef<string | null>(null)
  const pending = useMemo(() => queue.filter((item) => item.recordId === id), [queue, id])
  const head = pending[0]
  const editingQueue = pending.some((item) => item.editingText !== undefined)
  const queueBlocked =
    editingQueue ||
    Boolean(
      head &&
      (head.paused ||
        head.error ||
        (task?.status &&
          task.status !== 'completed' &&
          task.status !== 'running' &&
          !head.continueAfterFailure)),
    )
  const submit = (input: Parameters<typeof chatsApi.send>[0], queued = false) =>
    run(async () => {
      let accepted = false
      try {
        let sent!: Awaited<ReturnType<typeof chatsApi.send>>
        await savedDiaryAction(async () => {
          sent = await chatsApi.send(input)
        })
        accepted = true
        if (queued)
          setQueue((old) => old.filter((item) => item.input.requestId !== input.requestId))
        else sendRequest.current = null
        await onSent(sent, queued)
      } catch (e) {
        if (queued && !accepted)
          setQueue((old) =>
            old.map((item) =>
              item.input.requestId === input.requestId ? { ...item, error: errorMessage(e) } : item,
            ),
          )
        else throw e
      }
    })
  const send = () => {
    if (isBusy() || previewPending || !profileId || !text.trim()) return
    const input: Parameters<typeof chatsApi.send>[0] = {
      ...(selection ? { selection: { ...selection } } : {}),
      requestId: crypto.randomUUID(),
      conversationId: id,
      profileId,
      text,
      sourceIds: [...sources],
      recordDate: localDate(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    if (id && (running || pending.length)) {
      setQueue((old) => [...old, { recordId: id, input }])
      clearInput()
      sendRequest.current = null
      return
    }
    sendRequest.current ??= input.requestId
    input.requestId = sendRequest.current
    return submit(input)
  }
  const onQueueReady = useEffectEvent((input: Parameters<typeof chatsApi.send>[0]) =>
    isBusy() ? undefined : submit(input, true),
  )
  useEffect(() => {
    if (!canDispatch || !head || queueBlocked || !id || task?.status === 'save_failed') return
    void onQueueReady(head.input)
  }, [canDispatch, head, queueBlocked, id, task?.status])
  const continueQueue = () =>
    setQueue((old) =>
      old.map((item) =>
        item.recordId === id
          ? {
              ...item,
              paused: false,
              error: undefined,
              continueAfterFailure: item.input.requestId === head?.input.requestId,
            }
          : item,
      ),
    )
  const stop = () => {
    setQueue((old) => old.map((item) => (item.recordId === id ? { ...item, paused: true } : item)))
    void run(async () => {
      await aiTasksApi.cancel(task!.id)
      await refresh()
    })
  }
  const changeQueueText = (requestId: string, text: string) =>
    setQueue((old) =>
      old.map((value) =>
        value.input.requestId === requestId ? { ...value, editingText: text } : value,
      ),
    )
  const cancelQueueEdit = (requestId: string) =>
    setQueue((old) =>
      old.map((value) =>
        value.input.requestId === requestId ? { ...value, editingText: undefined } : value,
      ),
    )
  const editQueue = (requestId: string) => {
    if (!isBusy())
      setQueue((old) =>
        old.map((value) =>
          value.input.requestId === requestId ? { ...value, editingText: value.input.text } : value,
        ),
      )
  }
  const removeQueue = (requestId: string) =>
    setQueue((old) => old.filter((value) => value.input.requestId !== requestId))
  const saveQueueEdit = (requestId: string) =>
    setQueue((old) =>
      old.map((value) =>
        value.input.requestId === requestId
          ? {
              ...value,
              input: { ...value.input, text: value.editingText! },
              editingText: undefined,
            }
          : value,
      ),
    )
  return {
    pending,
    head,
    editingQueue,
    queueBlocked,
    hasDrafts: queue.length > 0,
    resetRequest: () => {
      sendRequest.current = null
    },
    forget: (chatId: string) => setQueue((old) => old.filter((item) => item.recordId !== chatId)),
    actions: {
      send,
      continueQueue,
      stop,
      changeQueueText,
      cancelQueueEdit,
      editQueue,
      removeQueue,
      saveQueueEdit,
    },
  }
}
