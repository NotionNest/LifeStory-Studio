import { useEffect, useLayoutEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { desktopAvailable } from '@/shared/runtime'

export type ThemePreference = 'system' | 'light' | 'dark'
const storageKey = 'lifestory.appearance'
const valid = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark'

export function useAppearance() {
  const [initial] = useState(() => {
    try {
      const value = localStorage.getItem(storageKey)
      return { preference: valid(value) ? value : 'system' as ThemePreference, error: '' }
    } catch {
      return { preference: 'system' as ThemePreference, error: '无法读取外观偏好。请检查本机存储权限。' }
    }
  })
  const [preference, setPreference] = useState(initial.preference)
  const [error, setError] = useState(initial.error)
  const [nativeError, setNativeError] = useState('')
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const dark = preference === 'dark' || (preference === 'system' && systemDark)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (!desktopAvailable) return
    let disposed = false
    setNativeError('')
    void getCurrentWindow().setTheme(preference === 'system' ? null : preference).catch(() => {
      if (!disposed) setNativeError('窗口外观未能切换，请重新选择主题或重启应用。')
    })
    return () => { disposed = true }
  }, [preference])

  const change = (value: string) => {
    if (!valid(value)) return
    setPreference(value)
    try {
      localStorage.setItem(storageKey, value)
      setError('')
    } catch {
      setError('外观已应用，但偏好未能保存，重开后可能改变。请检查本机存储权限。')
    }
  }
  return { preference, change, error: error || nativeError, dark }
}
