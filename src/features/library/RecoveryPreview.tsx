import { useEffect, useRef } from 'react'
import type { JSONContent } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import type { RecordFile, RecoveryDraft } from './api'
export function documentPreview(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const content = (node.content ?? []).map(documentPreview).join('')
  return ['paragraph', 'heading', 'listItem', 'codeBlock'].includes(node.type ?? '') ? `${content}\n` : content
}
export function RecoveryPreview({ record, draft, busy, error, onChoose, onCancel, onRefresh }: {
  record: RecordFile; draft: RecoveryDraft; busy: boolean; error: string
  onChoose: (action: 'restore' | 'discard') => void; onCancel: () => void; onRefresh: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }} aria-labelledby="recovery-title" className="fixed inset-0 m-auto w-[calc(100%-3rem)] max-w-4xl rounded-lg border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/25">
    <h2 id="recovery-title" className="text-lg font-semibold">发现未完成保存的恢复草稿</h2>
    <p className="my-3 text-sm text-muted-foreground">本机草稿写于 {new Date(draft.writtenAt).toLocaleString()}。先核对内容，再选择恢复或丢弃。</p>
    {draft.input.baseRevisionId !== record.revisionId && <p className="mb-3 text-sm">正式内容在草稿之后已有更新；请对照后决定是否恢复。</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <section className="min-w-0 rounded border p-4"><h3 className="mb-2 text-sm font-semibold">当前已保存</h3><p className="text-sm">{record.title || '无标题记录'} · {record.recordDate}</p><p className="mt-2 text-xs text-muted-foreground">{record.tags.map(t => `#${t.name}`).join(' ')}</p><pre className="mt-3 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{documentPreview(record.document) || '（空白正文）'}</pre></section>
      <section className="min-w-0 rounded border p-4"><h3 className="mb-2 text-sm font-semibold">可恢复草稿</h3><p className="text-sm">{draft.input.title || '无标题记录'} · {draft.input.recordDate || '日期待补充'}</p><p className="mt-2 text-xs text-muted-foreground">{draft.tags.map(t => `#${t.name}`).join(' ')}</p><pre className="mt-3 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{documentPreview(draft.input.document) || '（空白正文）'}</pre></section>
    </div>
    {error && <p role="alert" className="my-3 text-sm text-destructive">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => onChoose('restore')}>恢复到编辑器</Button><Button variant="outline" disabled={busy} onClick={onCancel}>稍后处理</Button><Button variant="ghost" disabled={busy} onClick={() => onChoose('discard')}>丢弃此草稿</Button>{error && <Button variant="secondary" disabled={busy} onClick={onRefresh}>重新读取预览</Button>}</div>
    <p className="mt-3 text-xs text-muted-foreground">恢复后会按正常保存流程生成新版本；保存成功前保留恢复副本。丢弃只清理这份草稿，不删除正式内容。</p>
  </dialog>
}
