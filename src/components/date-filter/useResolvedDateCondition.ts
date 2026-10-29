import { useEffect, useState } from 'react'
import { formatCalendarDate, resolveDateConstraint, type DateCondition } from './dateConditions'

export function useResolvedDateCondition(condition: DateCondition | null, active = true) {
  const [, setToday] = useState(() => formatCalendarDate())
  const dynamic = Boolean(condition && (condition.shortcut || condition.operator === 'relative'))
  useEffect(() => {
    if (!active || !dynamic) return
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      setToday(formatCalendarDate())
      clearTimeout(timer)
      const now = new Date(),
        next = new Date(now)
      next.setHours(24, 0, 0, 0)
      timer = setTimeout(update, next.getTime() - now.getTime() + 50)
    }
    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [active, dynamic])
  return resolveDateConstraint(condition)
}
