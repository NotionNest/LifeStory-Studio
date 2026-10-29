import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { desktop } from '@/services/desktop'
import { errorMessage } from '@/lib/errors'

import { useRouteBlocker } from '@/router/useRouteBlocker'
import {
  ExitDraftsDialog,
  UnsavedChangesDialog,
  type UnsavedChoice,
  type UnsavedConfirmation,
} from '@/components/dialogs/LeaveConfirmDialogs'

export interface LeaveGuard {
  canLeave?: () => boolean
  prepare: (to: string | null) => Promise<boolean>
  resume: () => void
  dirty: () => boolean
}
interface LeaveStatus {
  setBusy: (value: boolean) => void
  setDraft: (value: boolean) => void
  isBusy: () => boolean
  activate: () => void
  dispose: () => void
}
interface LeaveProtection {
  working: boolean
  error: string
  setError: (error: string) => void
  registerGuard: (guard: LeaveGuard) => () => void
  createStatus: () => LeaveStatus
  confirmUnsavedChanges: (confirmation: UnsavedConfirmation) => Promise<UnsavedChoice>
  prepareForAction: (to: string) => Promise<boolean>
  resume: () => void
  exit: (discardDrafts?: boolean) => Promise<void>
}
const LeaveProtectionContext = createContext<LeaveProtection | null>(null)

export function LeaveProtectionProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Set<LeaveGuard>())
  const busy = useRef(new Set<symbol>())
  const drafts = useRef(new Set<symbol>())
  const processing = useRef(false)
  const externalPreparation = useRef(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<UnsavedConfirmation | null>(null)
  const [exported, setExported] = useState(false)
  const [dialogBusy, setDialogBusy] = useState(false)
  const choice = useRef<((value: UnsavedChoice) => void) | null>(null)

  const registerGuard = useCallback((guard: LeaveGuard) => {
    guards.current.add(guard)
    return () => {
      guards.current.delete(guard)
    }
  }, [])
  const createStatus = useCallback((): LeaveStatus => {
    const token = Symbol('leave-status')
    let isBusy = false
    let isDraft = false
    // 挂起渲染可能永不提交：先暂存，提交时激活；卸载后回调不能重新登记。
    let active = false
    const update = (set: Set<symbol>, value: boolean) => {
      if (value) set.add(token)
      else set.delete(token)
    }
    return {
      setBusy(value) {
        isBusy = value
        if (active) update(busy.current, value)
      },
      setDraft(value) {
        isDraft = value
        if (active) update(drafts.current, value)
      },
      isBusy: () => isBusy,
      activate() {
        active = true
        update(busy.current, isBusy)
        update(drafts.current, isDraft)
      },
      dispose() {
        active = false
        busy.current.delete(token)
        drafts.current.delete(token)
      },
    }
  }, [])
  const resume = useCallback(() => {
    for (const guard of guards.current) guard.resume()
  }, [])
  const confirmUnsavedChanges = useCallback(
    (next: UnsavedConfirmation) =>
      new Promise<UnsavedChoice>((resolve) => {
        setExported(false)
        setConfirmation(next)
        choice.current = resolve
      }),
    [],
  )
  const choose = (value: UnsavedChoice) => {
    choice.current?.(value)
    choice.current = null
    setConfirmation(null)
  }
  const canLeave = () =>
    !busy.current.size && [...guards.current].every((guard) => guard.canLeave?.() ?? true)
  const prepare = async (to: string | null) => {
    if (!canLeave()) {
      setError('正在完成当前操作或核对写入结果，请完成后再离开。')
      return false
    }
    for (const guard of [...guards.current]) {
      if (!(await guard.prepare(to))) return false
    }
    return true
  }
  useRouteBlocker({ processing, externalPreparation, prepare, resume, setWorking, setError })

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !canLeave() ||
        drafts.current.size ||
        [...guards.current].some((guard) => guard.dirty())
      ) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const exit = async (discardDrafts = false) => {
    if (processing.current) return
    if (!canLeave()) {
      setError('正在完成当前操作或核对写入结果，请完成后再退出。')
      return
    }
    if (!discardDrafts && drafts.current.size) {
      setExitOpen(true)
      return
    }
    processing.current = true
    setWorking(true)
    try {
      if (await prepare(null)) {
        setExitOpen(false)
        await desktop.exit()
      }
    } catch (cause) {
      setError(errorMessage(cause))
      resume()
    } finally {
      processing.current = false
      setWorking(false)
    }
  }
  const prepareForAction = async (to: string) => {
    if (processing.current) return false
    processing.current = true
    externalPreparation.current = true
    setWorking(true)
    try {
      return await prepare(to)
    } catch (cause) {
      setError(errorMessage(cause))
      resume()
      return false
    } finally {
      processing.current = false
      externalPreparation.current = false
      setWorking(false)
    }
  }
  const exportCurrent = async () => {
    if (!confirmation) return
    setDialogBusy(true)
    try {
      setExported(await confirmation.onExport())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setDialogBusy(false)
    }
  }
  return (
    <LeaveProtectionContext
      value={{
        working,
        error,
        setError,
        registerGuard,
        createStatus,
        confirmUnsavedChanges,
        prepareForAction,
        resume,
        exit,
      }}
    >
      {children}
      {confirmation && (
        <UnsavedChangesDialog
          message={error || confirmation.message}
          busy={dialogBusy}
          exported={exported}
          onChoice={choose}
          onExport={() => void exportCurrent()}
        />
      )}
      {exitOpen && (
        <ExitDraftsDialog
          busy={working}
          onCancel={() => setExitOpen(false)}
          onExit={() => void exit(true)}
        />
      )}
    </LeaveProtectionContext>
  )
}

export function useLeaveProtection() {
  const value = useContext(LeaveProtectionContext)
  if (!value) throw new Error('页面必须位于 LeaveProtectionProvider 内')
  return value
}

export function useLeaveStatus() {
  const { createStatus } = useLeaveProtection()
  const status = useRef<LeaveStatus | null>(null)
  if (!status.current) status.current = createStatus()
  const current = status.current
  useLayoutEffect(() => {
    current.activate()
    return () => current.dispose()
  }, [current])
  return current
}
