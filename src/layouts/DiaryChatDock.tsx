import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { ChatSurface } from '@/features/chat/ChatWorkspace'
import { useChatDockWidth } from '@/hooks/useChatDockWidth'
import { chatRoute } from '@/router/paths'

export function DiaryChatDock({ children }: { children: ReactNode }) {
  const route = chatRoute(useLocation())
  const width = useChatDockWidth(route.docked)
  return (
    <div ref={width.container} className="flex min-h-0 min-w-0 flex-1">
      {children}
      {route.docked && (
        <section
          id="diary-chat-panel"
          aria-label="日记侧边聊天"
          className="relative min-h-0 min-w-0 shrink-0 border-l"
          style={{ width: width.width }}
        >
          <div
            role="separator"
            tabIndex={0}
            aria-label="调整聊天面板宽度"
            aria-orientation="vertical"
            aria-valuemin={width.min}
            aria-valuemax={width.max}
            aria-valuenow={width.width}
            className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none"
            {...width.handle}
          />
          {width.error && <p role="alert">{width.error}</p>}
          <ChatSurface />
        </section>
      )}
    </div>
  )
}
