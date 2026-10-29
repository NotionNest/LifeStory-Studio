import { Outlet } from 'react-router'
import { paths } from '@/router/paths'
import { SettingsLink } from '@/components/SettingsLink'
export function ModelsLayout() {
  return (
    <div className="settings-content min-w-0 max-w-5xl">
      <nav aria-label="模型配置分类" className="grid w-full grid-cols-2 rounded-full bg-muted p-1">
        <SettingsLink pill to={paths.cli}>
          本机 CLI
        </SettingsLink>
        <SettingsLink pill to={paths.api}>
          API 提供商
        </SettingsLink>
      </nav>
      <Outlet />
    </div>
  )
}
