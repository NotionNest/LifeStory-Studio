import { useEffect, useRef, useState } from 'react'
import { desktop, desktopAvailable } from '@/services/desktop'
import { errorMessage } from '@/lib/errors'

export function useDesktopLifecycle(onExit: () => Promise<void>) {
  const [macTitlebar, setMacTitlebar] = useState(false)
  const [error, setError] = useState('')
  const exit = useRef(onExit)
  exit.current = onExit
  useEffect(() => {
    if (!desktopAvailable) return
    let valid = true
    void desktop
      .readRuntimeInfo()
      .then((info) => {
        if (!valid) return
        setMacTitlebar(info.platform === 'macos')
        document.documentElement.classList.toggle(
          'native-material',
          info.platform === 'macos' || info.platform === 'windows',
        )
      })
      .catch((cause) => {
        if (valid) setError(errorMessage(cause))
      })
    const subscription = desktop.onExitRequested(() => {
      if (valid) void exit.current()
    })
    void subscription.catch((cause) => {
      if (valid) setError(`关闭保护不可用：${errorMessage(cause)}`)
    })
    return () => {
      valid = false
      document.documentElement.classList.remove('native-material')
      void subscription.then((unlisten) => unlisten()).catch(() => {})
    }
  }, [])
  return { macTitlebar, error }
}
