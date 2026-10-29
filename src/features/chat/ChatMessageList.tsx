import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { useChatView, type ChatMessagesView } from './ChatSessionProvider'
import { ChatMessageRow, ChatTaskMessage } from './ChatMessageRow'
import { useChatScroll } from './useChatScroll'
import { useHistoryPaging } from './useHistoryPaging'

export const ChatMessageList = memo(function ChatMessageList() {
  const view = useChatView('messages')
  return <ChatHistory key={view.id ?? 'new'} view={view} />
})

function ChatHistory({ view }: { view: ChatMessagesView }) {
  const { id, workspace, location, atLatest } = view
  const paging = useHistoryPaging(view)
  const scroll = useChatScroll(view, paging)
  const failure = paging.failure
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroll.viewport}
        {...scroll.events}
        className="size-full min-h-0 overflow-y-auto overscroll-contain [overflow-anchor:none]"
        aria-label="聊天消息"
        role="region"
        tabIndex={0}
      >
        <div
          className="relative mx-auto max-w-4xl"
          style={{ height: scroll.virtual.getTotalSize() }}
        >
          {scroll.rows.map((item) => {
            const message = workspace?.messages[item.index]
            return (
              <div
                key={item.key}
                ref={scroll.virtual.measureElement}
                data-index={item.index}
                data-message-id={message?.id ?? `task:${view.task?.id}`}
                tabIndex={-1}
                className="absolute left-0 top-0 w-full px-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {message ? (
                  <ChatMessageRow
                    message={message}
                    id={id}
                    location={location?.messageId === message.id ? location : null}
                  />
                ) : (
                  <ChatTaskMessage
                    task={view.task}
                    running={view.running}
                    busy={view.busy}
                    retrySave={view.retrySave}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {(!atLatest || (location && !location.follow)) && (
        <Button
          className="absolute bottom-4 left-1/2 -translate-x-1/2"
          variant="secondary"
          disabled={paging.loading}
          onClick={() => void paging.read('latest')}
        >
          回到最新消息
        </Button>
      )}
      {paging.loading && (
        <p role="status" className="absolute left-4 top-2 bg-background px-2 text-sm">
          正在读取消息…
        </p>
      )}
      {failure && (
        <p
          role="alert"
          className="absolute left-4 top-2 bg-background px-2 text-sm text-destructive"
        >
          {failure.message}
          <Button size="xs" variant="ghost" onClick={() => void paging.read(failure.direction)}>
            重试读取
          </Button>
        </p>
      )}
    </div>
  )
}
