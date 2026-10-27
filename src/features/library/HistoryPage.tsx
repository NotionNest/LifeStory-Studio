import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bookmark, ChevronRight, Circle, RotateCcw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { AttachmentImageNode } from './attachmentExtensions'
import { imageIds } from './imageDocument'
import { AttachmentSurface } from './AttachmentImage'
import StarterKit from '@tiptap/starter-kit'
import { libraryApi, errorMessage, type EditingSession, type HistoryCursor, type HistorySummary, type HistoryVersion, type RecordFile, type RestoreHistory } from './api'

function HistoryDocument({ document }: { document: JSONContent }) {
  const editor = useEditor({ extensions: [StarterKit.configure({ link: false }), AttachmentImageNode], content: document, editable: false, editorProps: { attributes: { 'aria-label': '历史正文（只读）' } } })
  return <EditorContent className="record-editor history-document mt-7" editor={editor} />
}

export interface HistoryHandle {canLeave:()=>boolean}
export const HistoryPage=forwardRef<HistoryHandle, {
  record: RecordFile; sessionId: string; onRestored: (session: EditingSession) => void; onClose: () => void
}>(function HistoryPage({record,sessionId,onRestored,onClose},ref) {
  const page = useRef<HTMLElement>(null)
  const [items, setItems] = useState<HistorySummary[]>([])
  const [cursor, setCursor] = useState<HistoryCursor | null>(null)
  const [viewingCurrent, setViewingCurrent] = useState(true)
  const [selected, setSelected] = useState<HistoryVersion | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const restoreRequest = useRef<RestoreHistory | null>(null)
  const operation = useRef(false),mutation=useRef(false)
  const load = async (before: HistoryCursor | null = null) => {
    if (operation.current) return
    operation.current = true
    setBusy(true); setError('')
    try {
      const page = await libraryApi.history(record.id, before)
      setItems(old => before ? [...old, ...page.items.filter(item => !old.some(o => o.id === item.id))] : page.items)
      setCursor(page.nextBefore)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { operation.current = false; setBusy(false) }
  }
  useImperativeHandle(ref,()=>({canLeave:()=>!mutation.current&&!uncertain}),[busy,uncertain])
  useEffect(() => { page.current?.focus(); void load() }, [])
  const select = async (id: string) => {
    if (operation.current || uncertain) return
    operation.current = true; setBusy(true); setError(''); setConfirm(false); setViewingCurrent(false); setSelected(null)
    try { setSelected(await libraryApi.version(record.id, id)) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { operation.current = false; setBusy(false) }
  }
  const mark = async () => {
    if (!selected || operation.current) return
    operation.current = true;mutation.current=true; setBusy(true); setError('')
    try {
      const important = !selected.summary.important
      await libraryApi.mark(record.id, selected.summary.id, important)
      setSelected({ ...selected, summary: { ...selected.summary, important } })
      setItems(old => old.map(item => item.id === selected.summary.id ? { ...item, important } : item))
    } catch (cause) { setError(errorMessage(cause)) }
    finally { operation.current = false;mutation.current=false; setBusy(false) }
  }
  const restore = async () => {
    if (!selected?.snapshot || operation.current) return
    operation.current = true;mutation.current=true; setBusy(true); setError('')
    restoreRequest.current ??= { recordId: record.id, revisionId: selected.summary.id, expectedContentVersion: record.contentVersion, sessionId, requestId: crypto.randomUUID() }
    try { onRestored(await libraryApi.restore(restoreRequest.current)) }
    catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : ''
      const ambiguous = uncertain || !['conflict', 'validation', 'not_found', 'corrupt_content', 'storage_busy', 'storage_full', 'storage_permission', 'storage_corrupt', 'storage_interrupted'].includes(code)
      setUncertain(ambiguous)
      if (!ambiguous) restoreRequest.current = null
      setError(`${errorMessage(cause)}${ambiguous ? '。恢复结果尚未确认，请重试同一恢复请求后再继续编辑。' : ''}`)
    } finally { operation.current = false;mutation.current=false; setBusy(false) }
  }
  const reread = async () => {
    if (operation.current) return
    operation.current = true;mutation.current=true; setBusy(true); setError('')
    try {
      const current = await libraryApi.read(record.id)
      onRestored(await libraryApi.begin(record.id, current.contentVersion))
    } catch (cause) { setError(`无法重新读取：${errorMessage(cause)}。请重试，当前编辑仍保持只读。`) }
    finally { operation.current = false;mutation.current=false; setBusy(false) }
  }
  const preview = viewingCurrent ? record : selected?.snapshot
  const previewDocument = viewingCurrent ? record.document : selected?.document
  const previewTime = viewingCurrent ? record.updatedAt : selected?.summary.createdAt
  const timeLabel = (time: number) => new Date(time).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const years = new Set<number>()
  return <section ref={page} tabIndex={-1} aria-label="日记历史与恢复" className="flex h-full min-h-0 flex-1 flex-col bg-card text-foreground outline-none">
    <header className="workspace-toolbar gap-3"><Button variant="ghost" size="sm" disabled={mutation.current||uncertain} onClick={onClose}><ArrowLeft data-icon="inline-start" aria-hidden="true"/>返回编辑</Button><h1 className="shrink-0 text-sm font-medium">历史与恢复</h1><span className="truncate text-xs text-muted-foreground">{record.title||'无标题日记'}</span></header>
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(160px,36%)_minmax(0,1fr)] sm:grid-cols-[minmax(210px,21%)_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r bg-sidebar" aria-label="历史导航">
        <header className="shrink-0 px-5 pb-4 pt-5">
          <h2 id="history-title" className="text-xs font-medium text-muted-foreground">记录历史</h2>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight">{new Date(record.updatedAt).getFullYear()}</p>
        </header>
        <section aria-label="历史版本列表" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <button disabled={busy || uncertain} aria-pressed={viewingCurrent} onClick={() => { setViewingCurrent(true); setSelected(null); setConfirm(false); setError('') }} className={`mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${viewingCurrent ? 'bg-muted/60' : ''}`}>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{timeLabel(record.updatedAt)}</span><span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Circle aria-hidden="true" className="size-1.5 fill-current text-primary" />当前版本</span></span>
            {viewingCurrent && <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          </button>
          {items.map(item => {
            const year = new Date(item.createdAt).getFullYear()
            const showYear = !years.has(year) && year !== new Date(record.updatedAt).getFullYear()
            years.add(year)
            const active = !viewingCurrent && selected?.summary.id === item.id
            return <div key={item.id}>
              {showYear && <h3 className="px-3 pb-1 pt-5 text-sm font-semibold">{year}</h3>}
              <button disabled={busy || uncertain} aria-pressed={active} onClick={() => void select(item.id)} className={`flex w-full items-start gap-2 rounded-lg px-3 py-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'bg-muted/60' : ''}`}>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{timeLabel(item.createdAt)}</span>{(item.restoredFromId || item.referenced || !item.restorable) && <span className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">{item.restoredFromId && <span>恢复版本</span>}{item.referenced && <span>被引用</span>}{!item.restorable && <span>旧版正文</span>}</span>}<span className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.excerpt || '空白正文'}</span></span>
                {item.important && <Bookmark aria-label="重要版本" className="mt-0.5 size-3.5 shrink-0 fill-current text-primary" />}
                {active && <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              </button>
              <div className="mx-3 border-b border-border/60" />
            </div>
          })}
          {!busy && items.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">暂无历史版本</p>}
          <div className="flex flex-wrap gap-1 px-1 pt-4"><Button variant="ghost" size="sm" disabled={busy || uncertain} onClick={() => { setViewingCurrent(true); setSelected(null); setConfirm(false); void load() }}>刷新历史</Button>{cursor && <Button variant="ghost" size="sm" disabled={busy || uncertain} onClick={() => void load(cursor)}>加载更多历史</Button>}</div>
        </section>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="历史版本预览">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="font-medium">{previewTime != null ? timeLabel(previewTime) : '选择历史版本'}</span><span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">{viewingCurrent ? '当前版本' : '历史版本'}</span></div>
          <div className="flex items-center gap-1.5">
            {selected && !viewingCurrent && <Button variant="ghost" size="icon" title={selected.summary.important ? '取消重要标记' : '标记为重要'} disabled={busy || uncertain} onClick={() => void mark()}><Bookmark aria-hidden="true" className={selected.summary.important ? 'fill-current text-primary' : ''} /><span className="sr-only">{selected.summary.important ? '取消重要标记' : '标记为重要'}</span></Button>}
            <Button size="sm" disabled={busy || uncertain || viewingCurrent || !selected?.snapshot} onClick={() => setConfirm(true)}><RotateCcw aria-hidden="true" />恢复此版本</Button>
          </div>
        </header>
        {error && <p role="alert" className="shrink-0 border-b bg-destructive/5 px-6 py-3 text-sm text-destructive">{error}</p>}
        {busy && <p role="status" className="shrink-0 px-6 py-2 text-xs text-muted-foreground">正在处理历史…</p>}
        {confirm && <div role="region" aria-label="恢复确认" className="shrink-0 border-b bg-muted/40 px-6 py-4"><p className="mb-3 text-sm leading-6">将标题、日期、标签和正文恢复为这个版本。当前已保存内容会保留在历史中，已有引用不变。</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void restore()}>{uncertain ? '重试同一恢复请求' : '确认恢复为新版本'}</Button><Button size="sm" variant="ghost" disabled={busy || uncertain} onClick={() => setConfirm(false)}>取消恢复</Button>{uncertain && <Button size="sm" variant="outline" disabled={busy} onClick={() => void reread()}>重新读取当前已保存内容</Button>}</div></div>}
        <div className="min-h-0 flex-1 overflow-auto">
          {previewDocument ? <article className="mx-auto w-full max-w-[960px] px-6 pb-20 pt-12 sm:px-12 sm:pt-16 lg:px-20 lg:pt-20">
            <h3 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{preview?.title || (viewingCurrent || selected?.snapshot ? '无标题记录' : '旧版正文')}</h3>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">{preview ? <><span>{preview.recordDate || '日期待补充'}</span>{preview.tags.map(tag => <span key={tag.id}>#{tag.name}</span>)}</> : <span>旧版历史缺少标题、日期和标签快照，仅可预览正文，不能完整恢复。</span>}</div>
            <AttachmentSurface scope={{ recordId: record.id, revisionId: viewingCurrent ? null : selected!.summary.id, attachments: viewingCurrent ? record.attachments : undefined, imageIds: imageIds(previewDocument) }}><HistoryDocument key={viewingCurrent ? 'current' : selected!.summary.id} document={previewDocument} /></AttachmentSurface>
          </article> : <p className="px-12 py-16 text-sm text-muted-foreground">选择一个历史版本预览内容。</p>}
        </div>
      </section>
    </div>
  </section>
})
