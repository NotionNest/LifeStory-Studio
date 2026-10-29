import type { CSSProperties } from 'react'
import { useLocation } from 'react-router'
import { ArrowLeftIcon, ArrowRightIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { useHistoryControls } from '@/router/useHistoryControls'

export function StudioTitlebar({ macTitlebar }: { macTitlebar: boolean }) {
  const location = useLocation()
  const { working } = useLeaveProtection()
  const history = useHistoryControls(working)
  const { sidebarTrigger, sidebarOpen, setSidebarOpen, setTitlebarTarget } = useWorkspace()
  const isDiary = location.pathname.startsWith('/diaries')
  const isSettings = location.pathname.startsWith('/settings')
  return (
    <header
      aria-label="窗口标题栏"
      className={`studio-titlebar${macTitlebar ? ' studio-titlebar-macos' : ''}`}
      data-tauri-drag-region
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="后退"
        disabled={working || !history.back}
        onClick={history.goBack}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="前进"
        disabled={working || !history.forward}
        onClick={history.goForward}
      >
        <ArrowRightIcon />
      </Button>
      {!isDiary && (
        <Button
          size="icon-sm"
          variant="ghost"
          ref={sidebarTrigger}
          aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          aria-expanded={sidebarOpen}
          aria-controls={isSettings ? 'settings-sidebar' : 'chat-sidebar'}
          onClick={(event) => {
            event.currentTarget.focus()
            setSidebarOpen(!sidebarOpen)
          }}
        >
          {sidebarOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
        </Button>
      )}
      <span className="text-xs font-medium" data-tauri-drag-region>
        LifeStory Studio
      </span>
      <div
        ref={setTitlebarTarget}
        role="toolbar"
        aria-label="当前页面操作"
        className="ml-auto flex shrink-0 items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      />
    </header>
  )
}
