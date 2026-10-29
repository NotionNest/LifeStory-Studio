import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export type UnsavedChoice = 'retry' | 'stay' | 'discard'

export interface UnsavedConfirmation {
  message: string
  onExport: () => Promise<boolean>
}

function LeaveDialog({
  title,
  busy,
  onCancel,
  children,
}: {
  title: string
  busy: boolean
  onCancel: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto max-w-lg rounded-lg border bg-card p-6 text-foreground backdrop:bg-foreground/25"
    >
      <h2 className="font-semibold">{title}</h2>
      {children}
    </dialog>
  )
}

export function UnsavedChangesDialog({
  message,
  busy,
  exported,
  onChoice,
  onExport,
}: {
  message: string
  busy: boolean
  exported: boolean
  onChoice: (choice: UnsavedChoice) => void
  onExport: () => void
}) {
  return (
    <LeaveDialog title="有尚未保存的修改" busy={busy} onCancel={() => onChoice('stay')}>
      <p className="my-3 text-sm">
        保存成功后再继续，或主动另存当前编辑内容。放弃修改后，未保存的内容将被丢弃。
      </p>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {exported && <p role="status">已另存到你选择的文件；资料库中的修改仍未保存。</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => onChoice('retry')}>
          保存并继续
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onExport}>
          主动另存
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onChoice('stay')}>
          继续编辑
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => onChoice('discard')}>
          放弃修改并继续
        </Button>
      </div>
    </LeaveDialog>
  )
}

export function ExitDraftsDialog({
  busy,
  onCancel,
  onExit,
}: {
  busy: boolean
  onCancel: () => void
  onExit: () => void
}) {
  return (
    <LeaveDialog title="还有未发送或未保存的内容" busy={busy} onCancel={onCancel}>
      <p className="my-4 text-sm">
        聊天输入、待发送消息、修改中的日记预览或服务配置尚未保存。退出将放弃这些输入，已经保存的聊天和日记保留。
      </p>
      <div className="flex gap-2">
        <Button onClick={onCancel}>返回继续</Button>
        <Button variant="outline" disabled={busy} onClick={onExit}>
          放弃这些输入并退出
        </Button>
      </div>
    </LeaveDialog>
  )
}
