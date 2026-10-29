import { useRef, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { BookOpenIcon, FeatherIcon, MessageCircleIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { WorkspaceCommand } from '@/features/search/WorkspaceCommand'
import { locationPath, paths } from '@/router/paths'

function RailLink({
  to,
  label,
  active,
  state,
  children,
}: {
  to: string
  label: string
  active: boolean
  state?: unknown
  children: ReactNode
}) {
  const { working } = useLeaveProtection()
  return (
    <Button
      asChild
      variant="navigation"
      size="icon"
      className="size-10"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <NavLink
        to={to}
        state={state}
        aria-disabled={working || undefined}
        onClick={(event) => {
          if (working) event.preventDefault()
        }}
      >
        {children}
      </NavLink>
    </Button>
  )
}

export function StudioRail() {
  const location = useLocation()
  const lastChat = useRef<string>(paths.newChat)
  if (location.pathname.startsWith('/chats/')) lastChat.current = locationPath(location)
  return (
    <nav aria-label="软件导航" className="studio-rail" data-tooltip-orientation="vertical">
      <div className="studio-mark">
        <FeatherIcon />
        <span className="sr-only">LifeStory Studio</span>
      </div>
      <RailLink to={paths.diaries} label="日记" active={location.pathname.startsWith('/diaries')}>
        <BookOpenIcon />
      </RailLink>
      <RailLink to={lastChat.current} label="聊天" active={location.pathname.startsWith('/chats')}>
        <MessageCircleIcon />
      </RailLink>
      <WorkspaceCommand />
      <div className="mt-auto" />
      <RailLink
        to={paths.appearance}
        label="设置"
        active={location.pathname.startsWith('/settings')}
        state={{ returnTo: locationPath(location) }}
      >
        <SettingsIcon />
      </RailLink>
    </nav>
  )
}
