import { useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { paths } from '@/router/paths'
import { SettingsLink } from '@/components/SettingsLink'
import { WorkspaceSidebar } from '@/components/WorkspaceSidebar'
export function SettingsLayout() {
  const { sidebarOpen, sidebarTrigger } = useWorkspace(),
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
  const navigation = (
    <nav aria-label="设置导航" className="settings-navigation">
      <div className="sidebar-heading">
        <h1 hidden={!sidebarOpen}>设置</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="返回主界面"
          onClick={() => void navigate(returnTo.current)}
        >
          <ArrowLeftIcon />
        </Button>
      </div>
      <p hidden={!sidebarOpen} className="sidebar-section-label">
        偏好设置
      </p>
      <SettingsLink to={paths.appearance}>外观</SettingsLink>
      <SettingsLink to={remembered.current.models}>模型与提供商</SettingsLink>
      <SettingsLink to={remembered.current.trash}>回收站</SettingsLink>
    </nav>
  )
  return (
    <section aria-label="设置页面" className="flex h-full min-h-0 min-w-0 flex-1">
      <WorkspaceSidebar
        returnFocusRef={sidebarTrigger}
        id="settings-sidebar"
        label="设置分类"
        open={sidebarOpen}
        className="settings-sidebar"
      >
        {sidebarOpen && navigation}
      </WorkspaceSidebar>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!sidebarOpen && <div className="settings-compact-navigation">{navigation}</div>}
        <Outlet />
      </div>
    </section>
  )
}
