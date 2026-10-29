import type { ReactNode } from 'react'
import { AppearanceProvider } from '@/contexts/AppearanceContext'
import { ModelProfilesProvider } from '@/contexts/ModelProfilesContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { LeaveProtectionProvider } from '@/contexts/LeaveProtectionContext'
import { SearchLocationProvider } from '@/features/search/SearchLocationContext'
import { SettingsSessionProvider } from '@/features/settings/SettingsSessionProvider'
import { DiaryActionsProvider } from '@/features/library/DiaryActions'
import { DiaryCreationProvider } from '@/features/library/DiaryCreation'
import { DiaryBrowserProvider } from '@/features/library/DiaryBrowserSession'
import { ChatSessionProvider } from '@/features/chat/ChatSessionProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LeaveProtectionProvider>
      <AppearanceProvider>
        <ModelProfilesProvider>
          <WorkspaceProvider>
            <SearchLocationProvider>
              <SettingsSessionProvider>
                <DiaryActionsProvider>
                  <DiaryCreationProvider>
                    <DiaryBrowserProvider>
                      <ChatSessionProvider>{children}</ChatSessionProvider>
                    </DiaryBrowserProvider>
                  </DiaryCreationProvider>
                </DiaryActionsProvider>
              </SettingsSessionProvider>
            </SearchLocationProvider>
          </WorkspaceProvider>
        </ModelProfilesProvider>
      </AppearanceProvider>
    </LeaveProtectionProvider>
  )
}
