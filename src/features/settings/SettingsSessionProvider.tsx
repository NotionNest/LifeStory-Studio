import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useModelProfiles } from '@/contexts/ModelProfilesContext'
import { useLeaveStatus } from '@/contexts/LeaveProtectionContext'
import { paths } from '@/router/paths'
import { ApiSettingsSession } from '@/features/settings/AiSettings'
import { LocalCliSession } from './LocalCliSettings'

export function SettingsSessionProvider({ children }: { children: ReactNode }) {
  const { profilesLoaded, profiles, preferences, refresh } = useModelProfiles()
  const location = useLocation()
  const api = useLeaveStatus()
  const cli = useLeaveStatus()
  return (
    <ApiSettingsSession
      ready={profilesLoaded}
      active={location.pathname === paths.api}
      profiles={profiles}
      preferences={preferences}
      onChange={() => void refresh()}
      onDirty={api.setDraft}
      onBusy={api.setBusy}
    >
      <LocalCliSession
        active={location.pathname === paths.cli}
        profiles={profiles}
        preferences={preferences}
        onChange={() => void refresh()}
        onDirty={cli.setDraft}
        onBusy={cli.setBusy}
      >
        {children}
      </LocalCliSession>
    </ApiSettingsSession>
  )
}
