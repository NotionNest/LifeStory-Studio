import { chatsApi, type AiWorkspace, type ChatWindowRequest } from '@/services/chats'
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
  readWorkspace?: (record: string, input?: ChatWindowRequest) => Promise<AiWorkspace>
  sessionKey: string
}
export function useChatTask({
  current,
  alive,
  setWorkspace,
  running,
  setError,
  sessionKey,
  readWorkspace = chatsApi.workspace,
}: Options) {
  const generation = useRef(0)
  const sequence = useRef(0)
  const mounted = useRef(false)
  const manualPending = useRef<number | null>(null)
  useLayoutEffect(() => {
    mounted.current = true
    generation.current += 1
    manualPending.current = null
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [sessionKey])
  const read = useCallback(
    async (reportError: boolean, input?: ChatWindowRequest) => {
      const record = current.current
      if (!record || !mounted.current || !alive.current) return false
      const owner = generation.current
      const request = ++sequence.current
      const valid = () =>
        mounted.current &&
        alive.current &&
        owner === generation.current &&
        request === sequence.current &&
        current.current === record
      if (!reportError) manualPending.current = request
      try {
        const workspace = await readWorkspace(record, input)
        if (!valid()) return false
        setWorkspace(workspace)
        return true
      } catch (cause) {
        if (!valid()) return false
        if (!reportError) throw cause
        setError(errorMessage(cause))
        return false
      } finally {
        if (manualPending.current === request) manualPending.current = null
      }
    },
    [current, alive, setWorkspace, setError, readWorkspace],
  )
  const loadWindow = useCallback((input: ChatWindowRequest) => read(false, input), [read])
  const refresh = useCallback(async () => {
    await read(false)
  }, [read])
  useEffect(() => {
    if (!running) return
    let pending = false
    const timer = window.setInterval(() => {
      if (pending || manualPending.current !== null) return
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
  return { refresh, loadWindow }
}
