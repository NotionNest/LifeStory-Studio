import { recordsApi, recordEvents } from '@/services/records'
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { desktopAvailable } from '@/services/desktop'
import { useLeaveProtection, useLeaveStatus } from '@/contexts/LeaveProtectionContext'
import { locationPath, paths } from '@/router/paths'
import { errorMessage } from '@/lib/errors'
import { localDate } from '@/lib/localDate'

function useCreation() {
  const location = useLocation(),
    navigate = useNavigate(),
    navigation = useLeaveProtection()
  const reportError = useEffectEvent((cause: unknown) => navigation.setError(errorMessage(cause)))
  const status = useLeaveStatus()
  const [working, setWorking] = useState(false)
  const pending = useRef(false),
    created = useRef<string | null>(null)
  const request = useRef<{ id: string; date: string; timezone: string } | null>(null)
  useEffect(() => {
    if (created.current && location.pathname === paths.diary(created.current))
      created.current = null
  }, [location.pathname])
  const create = async (date?: string) => {
    if (pending.current || navigation.working) return
    pending.current = true
    setWorking(true)
    try {
      if (!(await navigation.prepareForAction(locationPath(location)))) return
      if (!created.current) {
        const nextDate = date ?? localDate()
        if (request.current && request.current.date !== nextDate)
          throw new Error('上次创建结果尚未确认，请先按原日期重试，避免重复创建日记。')
        request.current ??= {
          id: crypto.randomUUID(),
          date: nextDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
        status.setBusy(true)
        const input = request.current
        const record = await recordsApi.create(input.id, input.date, input.timezone)
        created.current = record.id
        request.current = null
      }
      status.setBusy(false)
      await navigate(paths.diary(created.current))
    } catch (cause) {
      navigation.setError(errorMessage(cause))
      navigation.resume()
    } finally {
      status.setBusy(false)
      pending.current = false
      setWorking(false)
    }
  }
  const action = useRef(create)
  action.current = create
  useEffect(() => {
    if (!desktopAvailable) return
    let disposed = false
    const subscription = recordEvents.onNewRequested(() => {
      if (!disposed) void action.current()
    })
    void subscription.catch((cause) => {
      if (!disposed) reportError(cause)
    })
    return () => {
      disposed = true
      void subscription.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])
  return { create, working }
}
const Context = createContext<ReturnType<typeof useCreation> | null>(null)
export function DiaryCreationProvider({ children }: { children: ReactNode }) {
  const creation = useCreation()
  return <Context value={creation}>{children}</Context>
}
export function useCreateDiary() {
  const value = useContext(Context)
  if (!value) throw new Error('缺少新建日记操作')
  return value
}
