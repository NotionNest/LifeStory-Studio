import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { useModelProfiles } from '@/contexts/ModelProfilesContext'
import { useDesktopLifecycle } from '@/hooks/useDesktopLifecycle'
import { StudioTitlebar } from './StudioTitlebar'
import { StudioRail } from './StudioRail'
import { DiaryChatDock } from './DiaryChatDock'

export function StudioLayout() {
  const location = useLocation()
  const leave = useLeaveProtection()
  const models = useModelProfiles()
  const desktop = useDesktopLifecycle(leave.exit)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const isSettings = location.pathname.startsWith('/settings')
    const isDiary = location.pathname.startsWith('/diaries')
    document.title = `${isSettings ? '设置' : isDiary ? '日记' : '聊天'} · LifeStory Studio`
    if (isSettings) {
      const heading = content.current?.querySelector<HTMLElement>('h1')
      if (heading) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
      }
    }
  }, [location.pathname])
  return (
    <main className="studio-shell">
      <StudioTitlebar macTitlebar={desktop.macTitlebar} />
      <div className="studio-body">
        <StudioRail />
        <div className="studio-frame">
          {models.error && (
            <div role="alert" className="border-b px-4 py-2 text-sm text-destructive">
              {models.error}
              <Button size="sm" variant="ghost" onClick={() => void models.refresh()}>
                重新读取配置
              </Button>
            </div>
          )}
          {desktop.error && (
            <div role="alert" className="border-b px-4 py-2 text-sm text-destructive">
              {desktop.error}
            </div>
          )}
          {leave.error && (
            <div role="alert" className="border-b px-4 py-2 text-sm text-destructive">
              {leave.error}
            </div>
          )}
          <DiaryChatDock>
            <div ref={content} className="min-h-0 min-w-0 flex-1">
              <Outlet />
            </div>
          </DiaryChatDock>
        </div>
      </div>
    </main>
  )
}
