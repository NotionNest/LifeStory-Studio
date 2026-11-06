import { useState, type ReactNode } from 'react'
import { DiarySidebarContext } from './DiarySidebarContext'
import { useLocation } from 'react-router'
import { ChatSurface } from '@/features/chat/ChatWorkspace'
import { useChatDockWidth } from '@/hooks/useChatDockWidth'
import { chatRoute } from '@/router/paths'

export function DiarySidebarLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const route = chatRoute(location)
  const review =
    !route.docked &&
    new URLSearchParams(location.search).has('review') &&
    /^\/diaries\/[^/]+$/.test(location.pathname)
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const width = useChatDockWidth(route.docked || review)
  return (
    <DiarySidebarContext value={target}>
      <div ref={width.container} className="flex min-h-0 min-w-0 flex-1">
        {children}
        {(route.docked || review) && (
          <section
            id="diary-chat-panel"
            aria-label={review ? '文案审查侧栏' : '日记侧边聊天'}
            className="relative min-h-0 min-w-0 shrink-0 border-l"
            style={{ width: width.width }}
          >
            <div
              role="separator"
              tabIndex={0}
              aria-label="调整侧边栏宽度"
              aria-orientation="vertical"
              aria-valuemin={width.min}
              aria-valuemax={width.max}
              aria-valuenow={width.width}
              className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none"
              {...width.handle}
            />
            {width.error && <p role="alert">{width.error}</p>}
            {route.docked ? <ChatSurface /> : <div ref={setTarget} className="h-full" />}
          </section>
        )}
      </div>
    </DiarySidebarContext>
  )
}
