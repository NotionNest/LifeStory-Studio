import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
export function AttachmentSync({ busy, error, onReread }: { busy: boolean; error: string; onReread: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} onCancel={event => event.preventDefault()} aria-label="核对图片插入结果" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-card p-6 text-foreground backdrop:bg-foreground/25"><h2 className="text-lg font-semibold">图片插入结果尚未确认</h2><p className="my-3 text-sm leading-7">修改前的内容已经保存。请重新读取本机已保存内容，核对结果后再继续编辑，避免旧会话覆盖新的正文。</p><p role="alert" className="my-3 text-sm text-destructive">{error}</p><Button disabled={busy} onClick={onReread}>重新读取当前内容</Button></dialog>
}
