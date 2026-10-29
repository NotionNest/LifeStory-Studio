import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'

const storageKey = 'lifestory.chat-dock-width'
const minimum = 320,
  maximum = 640,
  initialWidth = 416,
  editorMinimum = 360
const clamp = (width: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, width)))

export function useChatDockWidth(active: boolean) {
  const [initial] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey),
        value = stored === null ? NaN : Number(stored)
      return {
        width: Number.isFinite(value) && value > 0 ? clamp(value, minimum, maximum) : initialWidth,
        error: '',
      }
    } catch {
      return { width: initialWidth, error: '无法读取聊天面板宽度偏好。' }
    }
  })
  const [preferred, setPreferred] = useState(initial.width),
    [error, setError] = useState(initial.error),
    [available, setAvailable] = useState(0),
    [dragging, setDragging] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    preferred: number
    current: number
  } | null>(null)
  useLayoutEffect(() => {
    if (!active || !container.current) return
    const node = container.current,
      measure = () => setAvailable(node.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
      drag.current = null
      setDragging(false)
    }
  }, [active])
  const max =
    available > 0 ? Math.min(maximum, Math.max(0, Math.floor(available - editorMinimum))) : maximum
  const min = Math.min(minimum, max)
  const width = clamp(preferred, min, max)
  const remember = (value: number) => {
    try {
      localStorage.setItem(storageKey, String(value))
      setError('')
    } catch {
      setError('聊天面板宽度未能保存，重开后可能改变。')
    }
  }
  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (cancel) setPreferred(current.preferred)
    else {
      const value = clamp(current.current, min, max)
      setPreferred(value)
      remember(value)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    container,
    width,
    min,
    max,
    error,
    dragging,
    handle: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || event.isPrimary === false || drag.current) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
          preferred,
          current: width,
        }
        setDragging(true)
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) return
        current.current = clamp(current.startWidth + current.startX - event.clientX, min, max)
        setPreferred(current.current)
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event),
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (drag.current) return
        const step = event.shiftKey ? 64 : 16
        const next =
          event.key === 'ArrowLeft'
            ? width + step
            : event.key === 'ArrowRight'
              ? width - step
              : event.key === 'Home'
                ? min
                : event.key === 'End'
                  ? max
                  : null
        if (next === null) return
        event.preventDefault()
        event.stopPropagation()
        const value = clamp(next, min, max)
        setPreferred(value)
        remember(value)
      },
    },
  }
}
