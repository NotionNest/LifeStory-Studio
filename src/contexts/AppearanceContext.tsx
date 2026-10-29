import { createContext, useContext, type ReactNode } from 'react'
import { useAppearance, type ThemePreference } from '@/hooks/useAppearance'

export interface AppearanceState {
  preference: ThemePreference
  dark: boolean
  error: string
  change: (value: string) => void
}
export const AppearanceContext = createContext<AppearanceState | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const appearance = useAppearance()
  return <AppearanceContext value={appearance}>{children}</AppearanceContext>
}

export function useAppearanceContext() {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('缺少外观上下文')
  return value
}
