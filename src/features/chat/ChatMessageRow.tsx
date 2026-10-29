import { memo } from 'react'
import { MessageDetails, ReasoningSummary } from './MessageDetails'
import { SearchHighlight } from '@/components/SearchHighlight'
import { Button } from '@/components/ui/button'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { AttachmentSurface, AttachmentImage } from '@/components/attachments/AttachmentImage'
import type { ChatMessage } from './chatHistory'
import type { MessageLocation } from './chatTypes'
import type { ChatMessagesView } from './ChatSessionProvider'

export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  id,
  location,
}: {
  message: ChatMessage
  id: string | null
  location: MessageLocation | null
}) {
  return (
    <Message align={message.role === 'user' ? 'end' : 'start'}>
      <MessageContent>
        <MessageHeader className="sr-only">{message.role === 'user' ? '你' : 'AI'}</MessageHeader>
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
  )
})

export function ChatTaskMessage({
  task,
  running,
  busy,
  retrySave,
}: Pick<ChatMessagesView, 'task' | 'running' | 'busy' | 'retrySave'>) {
  return (
    task && (
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
    )
  )
}
