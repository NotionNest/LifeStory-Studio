import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'

// Only committed entry keys are tracked; route content and navigation remain owned by Router.
export function useHistoryControls(disabled: boolean) {
  const location = useLocation(),
    action = useNavigationType(),
    navigate = useNavigate()
  const entries = useRef([location.key]),
    index = useRef(0),
    seen = useRef(location.key)
  const [availability, setAvailability] = useState({ back: false, forward: false })
  useEffect(() => {
    if (seen.current === location.key) return
    seen.current = location.key
    if (action === 'PUSH') {
      entries.current = entries.current.slice(0, index.current + 1)
      entries.current.push(location.key)
      index.current++
    } else if (action === 'REPLACE') entries.current[index.current] = location.key
    else {
      const found = entries.current.indexOf(location.key)
      if (found >= 0) index.current = found
      else {
        entries.current = [location.key]
        index.current = 0
      }
    }
    setAvailability({
      back: index.current > 0,
      forward: index.current < entries.current.length - 1,
    })
  }, [location.key, action])
  const back = () => {
    if (!disabled && availability.back) void navigate(-1)
  }
  const forward = () => {
    if (!disabled && availability.forward) void navigate(1)
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || disabled) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return
      const mac = event.metaKey && !event.ctrlKey && !event.altKey
      const other = event.altKey && !event.ctrlKey && !event.metaKey
      if ((mac && event.key === '[') || (other && event.key === 'ArrowLeft')) {
        event.preventDefault()
        if (availability.back) void navigate(-1)
      } else if ((mac && event.key === ']') || (other && event.key === 'ArrowRight')) {
        event.preventDefault()
        if (availability.forward) void navigate(1)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [availability, disabled, navigate])
  return { ...availability, goBack: back, goForward: forward }
}
