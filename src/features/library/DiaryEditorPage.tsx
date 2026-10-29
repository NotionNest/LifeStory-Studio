import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import {
  ArrowLeftIcon,
  HistoryIcon,
  MessageCircleIcon,
  PenLineIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useDiaryChatAddress } from '@/features/chat/ChatSessionProvider'
import { PageActions, type PageAction } from '@/layouts/PageActions'
import { Button } from '@/components/ui/button'
import { paths } from '@/router/paths'
import { useCreateDiary } from './DiaryCreation'
import { RecordEditorView } from './RecordEditor'
import { useDiary } from './DiarySessionContext'

export function DiaryEditorPage() {
  const { editor: session } = useDiary(),
    { titlebarTarget } = useWorkspace(),
    location = useLocation(),
    chatAddress = useDiaryChatAddress()
  const {
    record,
    working,
    requestDelete,
    viewport: detailScroll,
    restoreScroll,
    rememberScroll,
  } = session
  const navigate = useNavigate(),
    { recordId } = useParams()
  const { create, working: creating } = useCreateDiary()
  const article = useRef<HTMLElement>(null)
  const restore = useEffectEvent(() => restoreScroll())
  const remember = useEffectEvent((viewport: HTMLDivElement) => rememberScroll(viewport))
  useLayoutEffect(() => {
    const viewport = detailScroll.current
    restore()
    article.current
      ?.querySelector<HTMLInputElement>('[aria-label="记录标题"]')
      ?.focus({ preventScroll: true })
    return () => {
      if (viewport) remember(viewport)
    }
  }, [session.sessionId, detailScroll])
  const disabled = working || creating || session.blocked
  const actions: PageAction[] = [
    {
      id: 'chat',
      label: '聊聊这篇日记',
      icon: MessageCircleIcon,
      primary: true,
      disabled,
      onSelect: () => void navigate(chatAddress(recordId!)),
    },
    {
      id: 'rename',
      label: '重命名',
      icon: PencilIcon,
      disabled,
      onSelect: () => {
        const input = article.current?.querySelector<HTMLInputElement>('[aria-label="记录标题"]')
        input?.focus()
        input?.select()
      },
    },
    { id: 'create', label: '新建日记', icon: PenLineIcon, disabled, onSelect: () => void create() },
    {
      id: 'history',
      label: '查看历史',
      icon: HistoryIcon,
      disabled,
      onSelect: () => void navigate(paths.history(recordId!)),
    },
    {
      id: 'delete',
      label: '删除日记',
      icon: Trash2Icon,
      destructive: true,
      disabled,
      onSelect: () => void requestDelete().catch(() => {}),
    },
  ]
  const returnTo = location.state?.returnTo as string | undefined
  return (
    <section ref={article} aria-label="编辑工作区" className="flex h-full min-h-0 min-w-0 flex-col">
      <PageActions target={titlebarTarget} actions={actions} />
      <header className="workspace-toolbar">
        <Button
          variant="ghost"
          size="sm"
          disabled={working}
          onClick={() => void navigate(paths.diaries)}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回日记
        </Button>
        {returnTo?.startsWith('/chats/') && (
          <Button variant="ghost" size="sm" onClick={() => void navigate(returnTo)}>
            返回聊天
          </Button>
        )}
        {record && (
          <time
            dateTime={new Date(record.createdAt).toISOString()}
            className="ml-auto text-xs text-muted-foreground"
          >
            创建于 {new Date(record.createdAt).toLocaleString()}
          </time>
        )}
      </header>
      <div ref={detailScroll} className="flex min-h-0 flex-1 overflow-y-auto">
        <RecordEditorView />
      </div>
    </section>
  )
}
