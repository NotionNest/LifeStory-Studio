import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useLibraryQuery } from './useLibraryQuery'

type Position = { top: number; left: number; id?: string; index?: number; offset?: number }
function useBrowserSession() {
  const location = useLocation()
  const browser = useLibraryQuery(location.pathname === '/diaries')
  const positions = useRef<Record<string, Position>>({})
  return { browser, positions }
}
const Context = createContext<ReturnType<typeof useBrowserSession> | null>(null)
export function DiaryBrowserProvider({ children }: { children: ReactNode }) {
  const session = useBrowserSession()
  return <Context value={session}>{children}</Context>
}
export function useDiaryBrowser() {
  const session = useContext(Context)
  if (!session) throw new Error('缺少日记浏览会话')
  return session
}
