import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useChatSession } from './useChatSession'
type ChatSession = ReturnType<typeof useChatSession>

// Only committed view projections are published; the session remains the sole state owner.
function createViewSubscription<View extends object>(initial: View) {
  let current = initial
  const actions = new Map<keyof View, (...args: unknown[]) => unknown>()
  const listeners = new Set<() => void>()
  const project = (value: View): View =>
    Object.fromEntries(
      (Object.keys(value) as (keyof View)[]).map((key) => {
        if (typeof value[key] !== 'function') return [key, value[key]]
        if (!actions.has(key))
          actions.set(key, (...args) => {
            const action = current[key] as (...values: unknown[]) => unknown
            return action(...args)
          })
        return [key, actions.get(key)]
      }),
    ) as View
  let snapshot = project(initial)
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update(value: View) {
      current = value
      const next = project(value)
      const keys = Object.keys(next) as (keyof View)[]
      if (
        keys.length === Object.keys(snapshot).length &&
        keys.every((key) => Object.is(next[key], snapshot[key]))
      )
        return false
      snapshot = next
      return true
    },
    notify() {
      for (const listener of listeners) listener()
    },
  }
}
function createSubscriptions(session: ChatSession) {
  return {
    navigation: createViewSubscription(session.navigation),
    shell: createViewSubscription(session.shell),
    messages: createViewSubscription(session.messages),
    composer: createViewSubscription(session.composer),
    queue: createViewSubscription(session.queue),
    materials: createViewSubscription(session.materials),
    preview: createViewSubscription(session.preview),
  }
}
type Subscriptions = ReturnType<typeof createSubscriptions>
const ChatContext = createContext<Subscriptions | null>(null)
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const session = useChatSession()
  const [views] = useState(() => createSubscriptions(session))
  useLayoutEffect(() => {
    const changed: (() => void)[] = []
    function update<K extends keyof ChatSession>(key: K) {
      const view = views[key] as ReturnType<typeof createViewSubscription<ChatSession[K]>>
      if (view.update(session[key])) changed.push(view.notify)
    }
    update('navigation')
    update('shell')
    update('messages')
    update('composer')
    update('queue')
    update('materials')
    update('preview')
    // Publish every snapshot before notifying consumers that read more than one view.
    for (const notify of changed) notify()
  }, [session, views])
  return <ChatContext value={views}>{children}</ChatContext>
}
export function useChatView<K extends keyof ChatSession>(view: K): ChatSession[K] {
  const views = useContext(ChatContext)
  if (!views) throw new Error('缺少聊天会话')
  const subscription = views[view] as ReturnType<typeof createViewSubscription<ChatSession[K]>>
  return useSyncExternalStore(subscription.subscribe, subscription.getSnapshot)
}
export function useDiaryChatAddress() {
  return useChatView('navigation').diaryChatAddress
}
