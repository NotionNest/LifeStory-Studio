import { chatsApi, type AiWorkspace } from '@/services/chats'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { errorMessage } from '@/lib/errors'
interface Options {
  current: RefObject<string | null>
  alive: RefObject<boolean>
  setWorkspace: Dispatch<SetStateAction<AiWorkspace | null>>
  setError(message: string): void
  running: boolean
  sessionKey: string
}
export function useChatTask({
  current,
  alive,
  setWorkspace,
  running,
  setError,
  sessionKey,
}: Options) {
  const generation = useRef(0)
  const sequence = useRef(0)
  const mounted = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
    generation.current += 1
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [sessionKey])
  const read = useCallback(
    async (reportError: boolean) => {
      const record = current.current
      if (!record || !mounted.current || !alive.current) return
      const owner = generation.current
      const request = ++sequence.current
      const valid = () =>
        mounted.current &&
        alive.current &&
        owner === generation.current &&
        request === sequence.current &&
        current.current === record
      try {
        const workspace = await chatsApi.workspace(record)
        if (valid()) setWorkspace(workspace)
      } catch (cause) {
        if (!valid()) return
        if (reportError) setError(errorMessage(cause))
        else throw cause
      }
    },
    [current, alive, setWorkspace, setError],
  )
  const refresh = useCallback(() => read(false), [read])
  useEffect(() => {
    if (!running) return
    let pending = false
    const timer = window.setInterval(() => {
      if (pending) return
      pending = true
      void read(true).finally(() => {
        pending = false
      })
    }, 400)
    return () => {
      window.clearInterval(timer)
      sequence.current += 1
    }
  }, [running, read, sessionKey])
  return { refresh }
}
