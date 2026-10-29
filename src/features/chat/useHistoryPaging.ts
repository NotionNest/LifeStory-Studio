import { useRef, useState } from 'react'
import { errorMessage } from '@/lib/errors'
import { messageCursor } from './chatHistory'
import type { ChatMessagesView } from './ChatSessionProvider'

type Direction = 'before' | 'after' | 'latest'
type Request = { direction: Direction; status: 'loading' | 'failed'; message?: string }

export function useHistoryPaging({ workspace, loadWindow, resetLocation }: ChatMessagesView) {
  const pending = useRef(false)
  const [request, setRequest] = useState<Request | null>(null)
  const read = async (direction: Direction) => {
    const messages = workspace?.messages ?? []
    const edge = direction === 'before' ? messages[0] : messages[messages.length - 1]
    if (pending.current || (direction !== 'latest' && !edge)) return
    pending.current = true
    setRequest({ direction, status: 'loading' })
    try {
      if (direction === 'latest') await resetLocation()
      else await loadWindow({ [direction]: messageCursor(edge) })
      setRequest(null)
    } catch (cause) {
      setRequest({ direction, status: 'failed', message: errorMessage(cause) })
    } finally {
      pending.current = false
    }
  }
  return {
    read,
    loading: request?.status === 'loading',
    failure: request?.status === 'failed' ? request : null,
  }
}
