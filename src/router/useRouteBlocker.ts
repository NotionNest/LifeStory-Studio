import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import { useBlocker, useLocation } from 'react-router'
import { errorMessage } from '@/lib/errors'

interface RouteProtection {
  processing: RefObject<boolean>
  externalPreparation: RefObject<boolean>
  prepare: (to: string | null) => Promise<boolean>
  resume: () => void
  setWorking: (working: boolean) => void
  setError: (error: string) => void
}

export function useRouteBlocker(protection: RouteProtection) {
  const location = useLocation()
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search,
  )
  const blockerRef = useRef(blocker)
  blockerRef.current = blocker

  const onBlocked = useEffectEvent((blocker: ReturnType<typeof useBlocker>) => {
    if (blocker.state !== 'blocked') return
    if (protection.externalPreparation.current) {
      blocker.reset()
      return
    }
    if (protection.processing.current) return
    protection.processing.current = true
    protection.setWorking(true)
    protection.setError('')
    const blocked = blocker
    void protection
      .prepare(blocked.location.pathname + blocked.location.search)
      .then((ready) => {
        if (blockerRef.current.state !== 'blocked') return
        if (ready) blocked.proceed()
        else blocked.reset()
      })
      .catch((cause) => {
        protection.setError(errorMessage(cause))
        if (blockerRef.current.state === 'blocked') blockerRef.current.reset()
        protection.resume()
      })
      .finally(() => {
        protection.processing.current = false
        protection.setWorking(false)
      })
  })
  useEffect(() => {
    onBlocked(blocker)
  }, [blocker])

  const onNavigated = useEffectEvent(() => {
    if (!protection.processing.current) protection.setError('')
  })
  useEffect(() => {
    onNavigated()
  }, [location.key])
}
