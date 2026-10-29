import { memo } from 'react'
import { PencilIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChatView } from './ChatSessionProvider'
export const ChatQueue = memo(function ChatQueue() {
  const {
    pending,
    queueBlocked,
    editingQueue,
    taskStatus,
    busy,
    running,
    continueQueue,
    changeQueueText,
    cancelQueueEdit,
    editQueue,
    removeQueue,
    saveQueueEdit,
  } = useChatView('queue')
  return (
    <>
      {pending.length > 0 && (
        <section
          aria-label="待发送消息"
          className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border/60 p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">待发送 · {pending.length}</span>
            {queueBlocked && !editingQueue && taskStatus !== 'save_failed' && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={busy || running}
                onClick={continueQueue}
              >
                继续发送
              </Button>
            )}
          </div>
          {pending.map((item) => (
            <div key={item.input.requestId} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {item.editingText !== undefined ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      autoFocus
                      aria-label={`修改待发送消息：${item.input.text}`}
                      className="min-h-20 max-h-40"
                      value={item.editingText}
                      disabled={busy}
                      onChange={(e) => changeQueueText(item.input.requestId, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                          e.stopPropagation()
                          cancelQueueEdit(item.input.requestId)
                        }
                      }}
                    />
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="xs"
                        disabled={busy || !item.editingText.trim()}
                        onClick={() => saveQueueEdit(item.input.requestId)}
                      >
                        保存修改
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() => cancelQueueEdit(item.input.requestId)}
                      >
                        取消修改
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="truncate text-sm">{item.input.text}</p>
                )}
                {item.error && (
                  <p role="alert" className="text-xs text-destructive">
                    {item.error}
                  </p>
                )}
              </div>
              {item.editingText === undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`修改待发送消息：${item.input.text}`}
                  disabled={busy}
                  onClick={() => editQueue(item.input.requestId)}
                >
                  <PencilIcon />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`移除待发送消息：${item.input.text}`}
                disabled={busy}
                onClick={() => removeQueue(item.input.requestId)}
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </section>
      )}
    </>
  )
})
