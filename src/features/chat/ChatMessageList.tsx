import { memo } from 'react'
import { type AiWorkspace } from '@/services/chats'
import { MessageDetails, ReasoningSummary } from './MessageDetails'
import { SearchHighlight } from '@/components/SearchHighlight'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
} from '@/components/ui/message-scroller'
import { AttachmentSurface, AttachmentImage } from '@/components/attachments/AttachmentImage'
import { useChatView } from './ChatSessionProvider'
import type { MessageLocation } from './chatTypes'
export const ChatMessageList = memo(function ChatMessageList() {
  const {
    id,
    workspace,
    task,
    running,
    busy,
    location,
    located,
    missing,
    followLatest,
    resetLocation,
    retrySave,
  } = useChatView('messages')
  return (
    <div className="min-h-0 flex-1">
      <MessageScrollerProvider autoScroll={!location || location.follow}>
        <MessageScroller>
          <SearchLocation
            location={location}
            workspace={workspace}
            onLocated={located}
            onMissing={missing}
          />
          <MessageScrollerViewport
            onScroll={(event) => {
              const node = event.currentTarget
              if (
                location?.located &&
                !location.follow &&
                node.scrollHeight - node.clientHeight - node.scrollTop <= 8
              )
                followLatest()
            }}
          >
            <MessageScrollerContent className="mx-auto max-w-4xl p-6" aria-label="聊天消息">
              {workspace?.messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  tabIndex={-1}
                  messageId={message.id}
                  scrollAnchor={message.role === 'user'}
                >
                  <Message align={message.role === 'user' ? 'end' : 'start'}>
                    <MessageContent>
                      <MessageHeader className="sr-only">
                        {message.role === 'user' ? '你' : 'AI'}
                      </MessageHeader>
                      <ReasoningSummary text={message.reasoningSummary} />
                      <Bubble
                        align={message.role === 'user' ? 'end' : 'start'}
                        variant={message.role === 'user' ? 'muted' : 'ghost'}
                      >
                        <BubbleContent className="whitespace-pre-wrap leading-7">
                          {location?.messageId === message.id ? (
                            <SearchHighlight text={message.text} keyword={location.keyword} />
                          ) : (
                            message.text
                          )}
                          {Boolean(message.images?.length) && id && (
                            <AttachmentSurface
                              scope={{ recordId: id, revisionId: null, imageIds: message.images }}
                            >
                              <div className="mt-3 flex flex-wrap gap-3">
                                {message.images?.map((image) => (
                                  <AttachmentImage
                                    key={image}
                                    attachmentId={image}
                                    className="max-h-64 max-w-full rounded object-contain"
                                  />
                                ))}
                              </div>
                            </AttachmentSurface>
                          )}
                        </BubbleContent>
                      </Bubble>
                      {message.role === 'assistant' && (
                        <MessageDetails
                          text={message.text}
                          createdAt={message.createdAt}
                          durationMs={message.durationMs}
                        />
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
              {task && task.status !== 'completed' && (
                <MessageScrollerItem messageId={`task:${task.id}`}>
                  <Message>
                    <MessageContent>
                      <MessageHeader>
                        {running
                          ? '正在生成…'
                          : (
                              {
                                failed: '生成失败',
                                cancelled: '已取消',
                                interrupted: '上次生成已中断',
                                save_failed: '结果尚未保存',
                              } as Record<string, string>
                            )[task.status]}
                      </MessageHeader>
                      <MessageDetails
                        startedAt={task.startedAt}
                        running={running}
                        durationMs={
                          task.startedAt !== undefined && task.updatedAt !== undefined
                            ? task.updatedAt - task.startedAt
                            : undefined
                        }
                      />
                      <ReasoningSummary text={task.reasoningSummary} running={running} />
                      <p className="whitespace-pre-wrap text-sm leading-7">{task.partial}</p>
                      {task.error && <p className="text-sm text-destructive">{task.error}</p>}
                      {task.status === 'save_failed' && (
                        <Button variant="outline" disabled={busy} onClick={retrySave}>
                          重试保存结果
                        </Button>
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton aria-label="回到最新消息" onClick={resetLocation} />
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  )
})

function SearchLocation({
  location,
  workspace,
  onMissing,
  onLocated,
}: {
  location: MessageLocation | null
  workspace: AiWorkspace | null
  onMissing: () => void
  onLocated: () => void
}) {
  const { scrollToMessage } = useMessageScroller()
  const applied = useRef<number | null>(null)
  useEffect(() => {
    if (!location || !workspace || applied.current === location.nonce) return
    if (!workspace.messages.some((message) => message.id === location.messageId)) {
      applied.current = location.nonce
      onMissing()
      return
    }
    const frame = requestAnimationFrame(() => {
      if (scrollToMessage(location.messageId, { align: 'center', behavior: 'instant' })) {
        applied.current = location.nonce
        onLocated()
        ;[...document.querySelectorAll<HTMLElement>('[data-message-id]')]
          .find((node) => node.dataset.messageId === location.messageId)
          ?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [location, workspace, scrollToMessage, onMissing, onLocated])
  return null
}
