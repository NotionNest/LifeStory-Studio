import { modelProfilesApi, type AiPreferences, type AiProfile } from '@/services/modelProfiles'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { errorMessage } from '@/lib/errors'

import { desktopAvailable } from '@/services/desktop'

export interface ModelProfilesState {
  profiles: AiProfile[]
  preferences: AiPreferences
  profilesLoaded: boolean
  error: string
  refresh: () => Promise<void>
}
export const ModelProfilesContext = createContext<ModelProfilesState | null>(null)

export function ModelProfilesProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [preferences, setPreferences] = useState<AiPreferences>({ defaultProfileId: null })
  const [profilesLoaded, setProfilesLoaded] = useState(!desktopAvailable)
  const [error, setError] = useState('')
  const request = useRef(0)
  const refresh = useCallback(async () => {
    if (!desktopAvailable) return
    const current = ++request.current
    try {
      const [profiles, preferences] = await Promise.all([
        modelProfilesApi.profiles(),
        modelProfilesApi.preferences(),
      ])
      if (current !== request.current) return
      setProfiles(profiles)
      setPreferences(preferences)
      setProfilesLoaded(true)
      setError('')
    } catch (cause) {
      if (current === request.current) setError(errorMessage(cause))
    }
  }, [])
  useEffect(() => {
    void refresh()
    return () => {
      request.current += 1
    }
  }, [refresh])
  return (
    <ModelProfilesContext value={{ profiles, preferences, profilesLoaded, error, refresh }}>
      {children}
    </ModelProfilesContext>
  )
}

export function useModelProfiles() {
  const value = useContext(ModelProfilesContext)
  if (!value) throw new Error('缺少模型配置上下文')
  return value
}
