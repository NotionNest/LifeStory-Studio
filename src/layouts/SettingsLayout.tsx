import { useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { paths } from '@/router/paths'
import { SettingsLink } from '@/components/SettingsLink'
export function SettingsLayout() {
  const { sidebarOpen } = useWorkspace(),
    location = useLocation(),
    navigate = useNavigate()
  const returnTo = useRef(
    typeof location.state?.returnTo === 'string' && !location.state.returnTo.startsWith('/settings')
      ? location.state.returnTo
      : paths.diaries,
  )
  const remembered = useRef({ models: paths.cli, trash: paths.trash('diary') })
  if (location.pathname.startsWith('/settings/models/'))
    remembered.current.models = location.pathname
  if (location.pathname.startsWith('/settings/trash/')) remembered.current.trash = location.pathname
  const items = (
    <>
      <SettingsLink to={paths.appearance}>外观</SettingsLink>
      <SettingsLink to={remembered.current.models}>模型与提供商</SettingsLink>
      <SettingsLink to={remembered.current.trash}>回收站</SettingsLink>
    </>
  )
  const back = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="返回主界面"
      onClick={() => void navigate(returnTo.current)}
    >
      <ArrowLeftIcon />
    </Button>
  )
  return (
    <section aria-label="设置页面" className="flex h-full min-h-0 min-w-0 flex-1">
      {sidebarOpen && (
        <aside
          id="settings-sidebar"
          aria-label="设置分类"
          className="workspace-sidebar settings-sidebar"
        >
          <div className="sidebar-heading">
            <h1>设置</h1>
            {back}
          </div>
          <p className="sidebar-section-label">偏好设置</p>
          {items}
        </aside>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!sidebarOpen && (
          <div className="flex flex-wrap gap-2 px-5 pt-4">
            {back}
            {items}
          </div>
        )}
        <Outlet />
      </div>
    </section>
  )
}
