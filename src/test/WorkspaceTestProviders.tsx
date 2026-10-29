import { useRef, type ReactNode, type RefObject } from 'react'
import { AppearanceContext } from '@/contexts/AppearanceContext'
import { ModelProfilesContext } from '@/contexts/ModelProfilesContext'
import { WorkspaceContext } from '@/contexts/WorkspaceContext'
import { SearchLocationContext } from '@/features/search/SearchLocationContext'
import { DiaryActionsProvider } from '@/features/library/DiaryActions'
import type { AiPreferences, AiProfile } from '@/services/modelProfiles'

export function WorkspaceTestProviders({
  children,
  keyword,
  profiles = [],
  preferences = { defaultProfileId: null },
  titlebarTarget = null,
  sidebarOpen = true,
}: {
  children: ReactNode
  keyword: RefObject<string>
  profiles?: AiProfile[]
  preferences?: AiPreferences
  titlebarTarget?: HTMLElement | null
  sidebarOpen?: boolean
}) {
  const sidebarTrigger = useRef<HTMLButtonElement>(null)
  return (
    <AppearanceContext value={{ preference: 'system', change: () => {}, error: '', dark: false }}>
      <ModelProfilesContext
        value={{ profiles, preferences, profilesLoaded: true, error: '', refresh: async () => {} }}
      >
        <WorkspaceContext
          value={{
            titlebarTarget,
            sidebarTrigger,
            sidebarOpen,
            setSidebarOpen: () => {},
            setTitlebarTarget: () => {},
          }}
        >
          <SearchLocationContext value={keyword}>
            <DiaryActionsProvider>{children}</DiaryActionsProvider>
          </SearchLocationContext>
        </WorkspaceContext>
      </ModelProfilesContext>
    </AppearanceContext>
  )
}
