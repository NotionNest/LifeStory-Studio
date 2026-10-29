import { type ReactNode } from 'react'
import { Outlet } from 'react-router'
import { PageActions, type PageAction } from '@/layouts/PageActions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { BookOpenIcon, PenLineIcon, Trash2Icon, PencilIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { DeleteRecordDialog } from '@/components/dialogs/DeleteRecordDialog'
import { useChatView } from './ChatSessionProvider'
import { ChatMessagesPage } from './ChatMessagesPage'
import { ChatDiaryPreviewPage } from './ChatDiaryPreviewPage'
export function ChatWorkspace({ children }: { children?: ReactNode }) {
  const {
    id,
    active,
    titlebarTarget,
    sidebarOpen,
    onClose,
    setChatAddress,
    title,
    items,
    sourceNext,
    chats,
    next,
    busy,
    loading,
    error,
    notice,
    target,
    rename,
    setRename,
    deleteImpact,
    setDeleteImpact,
    localActions,
    setLocalActions,
    targetOpen,
    setTargetOpen,
    refreshChats,
    switchChat,
    queryMaterials,
    sourceTitles,
    availablePreview,
    canMakeDiary,
    previewOpen,
    running,
    pendingCount,
    profile,
    generate,
    chooseTarget,
    startRename,
    requestDeletion,
    deleted,
    saveRename,
    verifyState,
    selectTarget,
  } = useChatView('shell')
  const pageActions: PageAction[] =
    id && !previewOpen
      ? [
          ...(availablePreview
            ? [
                {
                  id: 'open-preview',
                  label: '查看日记预览',
                  icon: BookOpenIcon,
                  disabled: busy,
                  onSelect: () => setChatAddress(id, false, availablePreview),
                },
              ]
            : []),
          ...(canMakeDiary
            ? [
                {
                  id: 'save-diary',
                  label: '保存为日记',
                  icon: BookOpenIcon,
                  primary: true,
                  disabled: busy || running || pendingCount > 0 || !profile,
                  onSelect: () => void generate('create'),
                },
                {
                  id: 'choose-target',
                  label: '选择目标日记',
                  icon: BookOpenIcon,
                  disabled: busy || running,
                  onSelect: chooseTarget,
                },
              ]
            : []),
          ...(canMakeDiary && target
            ? [
                {
                  id: 'append-diary',
                  label: '补充到关联日记',
                  icon: BookOpenIcon,
                  disabled: busy || running || pendingCount > 0 || !profile,
                  onSelect: () => void generate('append'),
                },
                {
                  id: 'rewrite-diary',
                  label: '重新整理全文…',
                  icon: PencilIcon,
                  disabled: busy || running || pendingCount > 0 || !profile,
                  onSelect: () => void generate('rewrite'),
                },
              ]
            : []),
          {
            id: 'rename-chat',
            label: '重命名',
            icon: PencilIcon,
            disabled: busy,
            onSelect: startRename,
          },
          {
            id: 'delete-chat',
            label: '删除聊天',
            icon: Trash2Icon,
            destructive: true,
            disabled: busy,
            onSelect: requestDeletion,
          },
        ]
      : []
  return (
    <div className="flex h-full min-h-0">
      {active && (
        <PageActions target={onClose ? localActions : titlebarTarget} actions={pageActions} />
      )}
      <aside
        id="chat-sidebar"
        aria-label="聊天历史"
        hidden={!sidebarOpen}
        className="workspace-sidebar gap-3 p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-semibold">聊天</h1>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => switchChat(null)}>
            <PenLineIcon data-icon="inline-start" aria-hidden="true" />
            新对话
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !chats.length && (
            <p className="p-2 text-xs text-muted-foreground">正在读取…</p>
          )}
          {!loading && !chats.length && (
            <p className="p-2 text-sm text-muted-foreground">暂无聊天</p>
          )}
          {chats.map((chat) => (
            <Button
              key={chat.id}
              variant={id === chat.id ? 'secondary' : 'ghost'}
              aria-current={id === chat.id ? 'true' : undefined}
              className="mb-1 h-auto w-full justify-start whitespace-normal py-3 text-left"
              disabled={busy}
              onClick={() => switchChat(chat.id)}
            >
              {chat.title || '新的对话'}
            </Button>
          ))}
          {next !== null && (
            <Button variant="ghost" disabled={loading} onClick={() => void refreshChats(next)}>
              更多聊天
            </Button>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="聊天工作区">
        <header className="workspace-toolbar gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{title || '新对话'}</h2>
          </div>
          <div ref={setLocalActions} className="flex gap-1">
            {!sidebarOpen && !onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="新对话"
                title="新对话"
                disabled={busy}
                onClick={() => switchChat(null)}
              >
                <PenLineIcon aria-hidden="true" />
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="关闭侧边聊天"
                disabled={busy}
                onClick={onClose}
              >
                <XIcon aria-hidden="true" />
              </Button>
            )}
          </div>
        </header>
        {error && (
          <div role="alert" className="shrink-0 px-5 py-3 text-sm text-destructive">
            {error}
            <Button variant="ghost" size="sm" onClick={verifyState}>
              核对状态
            </Button>
          </div>
        )}
        {notice && (
          <p role="status" className="px-5 py-2 text-sm">
            {notice}
          </p>
        )}
        {rename !== null && (
          <form
            className="flex gap-2 border-b p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void saveRename()
            }}
          >
            <Input
              aria-label="聊天名称"
              value={rename}
              onChange={(e) => setRename(e.target.value)}
            />
            <Button disabled={busy}>保存名称</Button>
            <Button type="button" variant="ghost" onClick={() => setRename(null)}>
              取消
            </Button>
          </form>
        )}
        {children ?? <Outlet />}
      </section>
      <Dialog open={active && targetOpen} onOpenChange={setTargetOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>选择目标日记</DialogTitle>
          </DialogHeader>
          <NativeSelect
            className="w-full"
            aria-label="补充目标日记"
            value={target ?? ''}
            onChange={(e) => selectTarget(e.target.value || null)}
          >
            <NativeSelectOption value="">选择日记</NativeSelectOption>
            {target && !items.some((item) => item.id === target) && (
              <NativeSelectOption value={target}>
                {sourceTitles[target] || '已选日记'}
              </NativeSelectOption>
            )}
            {items.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.title || '无标题日记'}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {sourceNext !== null && (
            <Button variant="ghost" onClick={() => void queryMaterials(sourceNext, '')}>
              更多日记
            </Button>
          )}
          <DialogFooter>
            <Button onClick={() => setTargetOpen(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {deleteImpact && (
        <DeleteRecordDialog
          impact={deleteImpact}
          onClose={() => setDeleteImpact(null)}
          onDeleted={deleted}
        />
      )}
    </div>
  )
}
export function ChatSurface() {
  const { previewOpen } = useChatView('navigation')
  return (
    <ChatWorkspace>{previewOpen ? <ChatDiaryPreviewPage /> : <ChatMessagesPage />}</ChatWorkspace>
  )
}
