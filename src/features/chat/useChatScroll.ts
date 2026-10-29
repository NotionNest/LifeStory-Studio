import { useCallback, useEffect, useLayoutEffect, useRef, type UIEvent } from 'react'
import { defaultRangeExtractor, elementScroll, useVirtualizer } from '@tanstack/react-virtual'
import type { ChatMessagesView } from './ChatSessionProvider'
import type { ChatMessage } from './chatHistory'
import type { useHistoryPaging } from './useHistoryPaging'

const emptyMessages: ChatMessage[] = []
const messageGap = 24

export function useChatScroll(view: ChatMessagesView, paging: ReturnType<typeof useHistoryPaging>) {
  const { workspace, task, location, latestVersion, located, missing, setAtLatest, followLatest } =
    view
  const messages = workspace?.messages ?? emptyMessages
  const page = workspace?.page
  const showTask = !!task && task.status !== 'completed' && !page?.hasAfter
  const count = messages.length + Number(showTask)
  const viewport = useRef<HTMLDivElement>(null)
  const focused = useRef<string | null>(null)
  const appliedLocation = useRef<number | null>(null)
  const appliedLatest = useRef<number | null>(null)
  const programmaticOffset = useRef<number | null>(null)
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indexes = defaultRangeExtractor(range)
      const index = messages.findIndex((message) => message.id === focused.current)
      return index >= 0 && !indexes.includes(index)
        ? [...indexes, index].sort((a, b) => a - b)
        : indexes
    },
    [messages],
  )
  const virtual = useVirtualizer({
    count,
    getScrollElement: () => viewport.current,
    getItemKey: (index) => messages[index]?.id ?? `task:${task?.id}`,
    estimateSize: () => 180 - messageGap,
    overscan: 4,
    gap: messageGap,
    paddingStart: messageGap,
    paddingEnd: 2 * messageGap,
    anchorTo: 'end',
    followOnAppend: !location || !!location.follow,
    scrollEndThreshold: 8,
    rangeExtractor,
    scrollToFn: (offset, options, instance) => {
      elementScroll(offset, options, instance)
      // Record the applied offset, including browser clamping and size corrections.
      programmaticOffset.current = instance.scrollElement?.scrollTop ?? null
    },
  })
  useLayoutEffect(() => {
    // Compensate resized rows above the viewport even while reading backwards.
    virtual.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
      item.end <= (instance.scrollOffset ?? 0)
  }, [virtual])
  const rows = virtual.getVirtualItems()
  useLayoutEffect(() => {
    if (focused.current && !messages.some((message) => message.id === focused.current)) {
      viewport.current?.focus({ preventScroll: true })
      focused.current = null
    }
  }, [messages])
  useLayoutEffect(() => {
    if (!workspace || !count || location || appliedLatest.current === latestVersion) return
    virtual.scrollToEnd({ behavior: 'instant' })
    appliedLatest.current = latestVersion
  }, [workspace, count, location, latestVersion, virtual])
  useEffect(() => {
    if (!location || !workspace || appliedLocation.current === location.nonce) return
    const index = messages.findIndex((message) => message.id === location.messageId)
    if (index < 0) {
      appliedLocation.current = location.nonce
      missing()
      return
    }
    appliedLatest.current = latestVersion
    virtual.scrollToIndex(index, { align: 'center', behavior: 'instant' })
    const node = viewport.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (node) {
      node.focus({ preventScroll: true })
      focused.current = location.messageId
      appliedLocation.current = location.nonce
      located()
    }
  }, [location, workspace, messages, latestVersion, virtual, rows, located, missing])
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget
    const end = node.scrollHeight - node.clientHeight - node.scrollTop <= 8
    const programmatic =
      programmaticOffset.current !== null &&
      Math.abs(node.scrollTop - programmaticOffset.current) < 1
    programmaticOffset.current = null
    setAtLatest(end && !page?.hasAfter)
    if (programmatic || appliedLatest.current === null) return
    if (end && !page?.hasAfter && location?.located && !location.follow) followLatest()
    if (paging.loading) return
    if (node.scrollTop < 500 && page?.hasBefore) void paging.read('before')
    else if (node.scrollHeight - node.clientHeight - node.scrollTop < 500 && page?.hasAfter)
      void paging.read('after')
  }
  return {
    viewport,
    virtual,
    rows,
    events: {
      onScroll,
      onFocusCapture: (event: React.FocusEvent<HTMLDivElement>) => {
        focused.current =
          (event.target as HTMLElement).closest<HTMLElement>('[data-message-id]')?.dataset
            .messageId ?? null
      },
      onBlurCapture: (event: React.FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focused.current = null
      },
    },
  }
}
