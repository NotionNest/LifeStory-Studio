import { searchApi, type SearchItem, type ChatSearchItem } from '@/services/search'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpenIcon,
  MessageCircleIcon,
  SearchIcon,
  SettingsIcon,
  PenLineIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { errorMessage } from '@/lib/errors'
import { emptyFilters } from '@/features/library/useLibraryQuery'
import { SearchHighlight } from '@/components/SearchHighlight'

export type SearchAction =
  | { kind: 'diary'; id: string }
  | { kind: 'chat'; id: string | null; messageId?: string; keyword?: string }
  | { kind: 'create' }
  | { kind: 'settings' }
type Page<T> = { items: T[]; nextOffset: number | null }
const diaries = (keyword: string, offset: number) =>
  searchApi.query({ ...emptyFilters, keyword, month: null, offset })
const chats = (keyword: string, offset: number) => searchApi.searchChats(keyword, offset)
const diaryKey = (item: SearchItem) => item.id
const chatKey = (item: ChatSearchItem) => `${item.chatId}:${item.messageId ?? 'title'}`
function useResults<T>(
  keyword: string,
  loader: (keyword: string, offset: number) => Promise<Page<T>>,
  identity: (item: T) => string,
) {
  const [page, setPage] = useState<Page<T>>({ items: [], nextOffset: null }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0)
  const load = useCallback(
    async (offset = 0) => {
      const request = ++sequence.current
      setLoading(true)
      setError('')
      try {
        const result = await loader(keyword, offset)
        if (request === sequence.current)
          setPage((old) => ({
            ...result,
            items: [
              ...new Map(
                [...(offset ? old.items : []), ...result.items].map((item) => [
                  identity(item),
                  item,
                ]),
              ).values(),
            ],
          }))
      } catch (cause) {
        if (request === sequence.current) setError(errorMessage(cause))
      } finally {
        if (request === sequence.current) setLoading(false)
      }
    },
    [keyword, loader, identity],
  )
  useEffect(() => {
    sequence.current += 1
    setPage({ items: [], nextOffset: null })
    setError('')
    setLoading(Boolean(keyword))
    if (!keyword) return
    const timer = window.setTimeout(() => void load(), 200)
    return () => {
      clearTimeout(timer)
      sequence.current += 1
    }
  }, [keyword, load])
  return { page, loading, error, load }
}
function ResultsState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean
  error: string
  empty: boolean
  onRetry: () => void
}) {
  return (
    <>
      {loading && (
        <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
          正在搜索…
        </p>
      )}
      {error && (
        <div role="alert" className="px-3 py-2 text-sm text-destructive">
          {error}
          <Button size="xs" variant="ghost" onClick={onRetry}>
            重试
          </Button>
        </div>
      )}
      {!loading && !error && empty && (
        <p className="px-3 py-2 text-sm text-muted-foreground">无匹配结果</p>
      )}
    </>
  )
}
export function GlobalCommand({
  disabled,
  onAction,
}: {
  disabled: boolean
  onAction: (action: SearchAction) => void
}) {
  const [open, setOpen] = useState(false),
    [input, setInput] = useState(''),
    [composing, setComposing] = useState(false)
  const keyword = open && !composing ? input.trim() : ''
  const diary = useResults<SearchItem>(keyword, diaries, diaryKey),
    chat = useResults<ChatSearchItem>(keyword, chats, chatKey)
  const previousFocus = useRef<HTMLElement | null>(null),
    selected = useRef<SearchAction | null>(null)
  const toggle = useCallback(
    () =>
      setOpen((value) => {
        if (!value) {
          previousFocus.current = document.activeElement as HTMLElement
          selected.current = null
          setInput('')
          setComposing(false)
        }
        return !value
      }),
    [],
  )
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return
      if (!open && document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]'))
        return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  }, [open, toggle])
  const choose = (action: SearchAction) => {
    if (disabled) return
    selected.current = action
    setOpen(false)
  }
  const actions = [
    { label: '新建日记', icon: PenLineIcon, action: { kind: 'create' } },
    { label: '新建聊天', icon: MessageCircleIcon, action: { kind: 'chat', id: null } },
    { label: '打开设置', icon: SettingsIcon, action: { kind: 'settings' } },
  ] satisfies { label: string; icon: typeof SearchIcon; action: SearchAction }[]
  const matchingActions = actions.filter((action) => !keyword || action.label.includes(keyword))
  return (
    <>
      <Button
        variant="navigation"
        size="icon"
        className="size-10"
        aria-label="搜索与快捷操作"
        title="搜索与快捷操作（⌘K / Ctrl+K）"
        onClick={toggle}
      >
        <SearchIcon aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-xl"
          showCloseButton={false}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const action = selected.current
            selected.current = null
            if (action) onAction(action)
            else previousFocus.current?.focus({ preventScroll: true })
          }}
        >
          <DialogTitle className="sr-only">搜索与快捷操作</DialogTitle>
          <Command shouldFilter={false} label="搜索与快捷操作">
            <CommandInput
              aria-label="搜索日记、聊天或操作"
              placeholder="搜索日记、聊天或操作…"
              maxLength={200}
              value={input}
              onValueChange={setInput}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
            />
            <CommandList className="max-h-[min(60dvh,480px)]">
              {matchingActions.length > 0 && (
                <CommandGroup heading="操作">
                  {matchingActions.map(({ label, icon: Icon, action }) => (
                    <CommandItem
                      key={label}
                      value={`action:${label}`}
                      disabled={disabled}
                      onSelect={() => choose(action)}
                    >
                      <Icon aria-hidden="true" />
                      {label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {keyword && (
                <>
                  <CommandGroup heading="日记">
                    <ResultsState
                      loading={diary.loading}
                      error={diary.error}
                      empty={!diary.page.items.length}
                      onRetry={() => void diary.load(diary.page.nextOffset ?? 0)}
                    />
                    {diary.page.items.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`diary:${item.id}`}
                        disabled={disabled || diary.loading}
                        onSelect={() => choose({ kind: 'diary', id: item.id })}
                      >
                        <BookOpenIcon aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">
                            <SearchHighlight
                              text={item.title || item.excerpt.split('\n')[0] || '无标题日记'}
                              keyword={keyword}
                            />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            <SearchHighlight text={item.excerpt} keyword={keyword} />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{item.recordDate}</span>
                      </CommandItem>
                    ))}
                    {diary.page.nextOffset !== null && !diary.error && (
                      <CommandItem
                        value="more:diary"
                        disabled={diary.loading}
                        onSelect={() => void diary.load(diary.page.nextOffset!)}
                      >
                        加载更多日记
                      </CommandItem>
                    )}
                  </CommandGroup>
                  <CommandGroup heading="聊天">
                    <ResultsState
                      loading={chat.loading}
                      error={chat.error}
                      empty={!chat.page.items.length}
                      onRetry={() => void chat.load(chat.page.nextOffset ?? 0)}
                    />
                    {chat.page.items.map((item) => (
                      <CommandItem
                        key={`${item.chatId}:${item.messageId ?? 'title'}`}
                        value={`chat:${item.chatId}:${item.messageId ?? 'title'}`}
                        disabled={disabled || chat.loading}
                        onSelect={() =>
                          choose({
                            kind: 'chat',
                            id: item.chatId,
                            messageId: item.messageId ?? undefined,
                            keyword,
                          })
                        }
                      >
                        <MessageCircleIcon aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="truncate">
                            <SearchHighlight text={item.title || '新的对话'} keyword={keyword} />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.role ? `${item.role === 'user' ? '你' : 'AI'} · ` : ''}
                            <SearchHighlight text={item.excerpt} keyword={keyword} />
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                    {chat.page.nextOffset !== null && !chat.error && (
                      <CommandItem
                        value="more:chat"
                        disabled={chat.loading}
                        onSelect={() => void chat.load(chat.page.nextOffset!)}
                      >
                        加载更多聊天结果
                      </CommandItem>
                    )}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
