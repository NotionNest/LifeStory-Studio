import { useLocation, useNavigate } from 'react-router'
import { useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { useCreateDiary } from '@/features/library/DiaryCreation'
import { locationPath, paths } from '@/router/paths'
import { GlobalCommand, type SearchAction } from './GlobalCommand'
import { useSearchLocation } from './SearchLocationContext'

export function WorkspaceCommand() {
  const location = useLocation()
  const navigate = useNavigate()
  const { working } = useLeaveProtection()
  const { create } = useCreateDiary()
  const keyword = useSearchLocation()
  const execute = (action: SearchAction) => {
    if (action.kind === 'diary') void navigate(paths.diary(action.id))
    else if (action.kind === 'chat' && action.id) {
      keyword.current = action.keyword ?? ''
      void navigate(
        paths.chat(action.id) +
          (action.messageId ? `?${new URLSearchParams({ message: action.messageId })}` : ''),
      )
    } else if (action.kind === 'settings')
      void navigate(paths.appearance, { state: { returnTo: locationPath(location) } })
    else void create()
  }
  return <GlobalCommand disabled={working} onAction={execute} />
}
