import { NavLink, useMatch } from 'react-router'
import { Button } from '@/components/ui/button'

export function SettingsLink({
  to,
  children,
  end = true,
  pill = false,
}: {
  to: string
  children: React.ReactNode
  end?: boolean
  pill?: boolean
}) {
  const active = Boolean(useMatch({ path: to, end }))
  return (
    <Button
      asChild
      variant={active && !pill ? 'secondary' : 'ghost'}
      className={
        pill
          ? 'h-9 w-full min-w-0 rounded-full text-muted-foreground aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm'
          : 'w-full justify-start'
      }
    >
      <NavLink to={to} end={end}>
        {children}
      </NavLink>
    </Button>
  )
}
