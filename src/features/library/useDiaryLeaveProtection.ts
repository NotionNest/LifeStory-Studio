import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { recordEvents } from '@/services/records'
import { desktopAvailable } from '@/services/desktop'
import { errorMessage } from '@/lib/errors'
import { useDiaryActions } from './DiaryActions'
interface DiaryLeavePolicy {
  canLeave(): boolean
  prepare(to: string | null): Promise<boolean>
  failureMessage(): string
  exportUnsaved(): Promise<boolean>
  discard(): Promise<boolean>
  resume(): void
  resumeEditor(): void
  dirty(): boolean
  withSavedDiary(action: () => Promise<void>): Promise<void>
  save(): void
}
export function useDiaryLeaveProtection(policy: DiaryLeavePolicy) {
  const navigation = useLeaveProtection(),
    diaryActions = useDiaryActions()
  const releaseRegistration = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    const releaseGuard = navigation.registerGuard({
      canLeave: policy.canLeave,
      prepare: async (to) => {
        while (!(await policy.prepare(to))) {
          const message = policy.failureMessage()
          navigation.setError(message)
          const answer = await navigation.confirmUnsavedChanges({
            message,
            onExport: policy.exportUnsaved,
          })
          if (answer === 'stay') {
            policy.resumeEditor()
            return false
          }
          if (answer === 'discard' && (await policy.discard())) return true
        }
        return true
      },
      resume: policy.resume,
      dirty: policy.dirty,
    })
    const releaseAction = diaryActions.register(policy.withSavedDiary)
    const release = () => {
      releaseGuard()
      releaseAction()
    }
    releaseRegistration.current = release
    return release
  })
  const onSave = useEffectEvent(() => policy.save())
  const onError = useEffectEvent((cause: unknown) => navigation.setError(errorMessage(cause)))
  useEffect(() => {
    if (!desktopAvailable) return
    let disposed = false
    const subscription = recordEvents.onSaveRequested(() => {
      if (!disposed) onSave()
    })
    void subscription.catch((cause) => {
      if (!disposed) onError(cause)
    })
    return () => {
      disposed = true
      void subscription.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])
  return useCallback(() => releaseRegistration.current(), [])
}
