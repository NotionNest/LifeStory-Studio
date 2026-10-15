import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Button } from '@/components/ui/button'
import { desktopAvailable } from '@/shared/runtime'
import { libraryApi, localDate, errorMessage, type RecordFile, type RecordSummary } from './api'
import { RecordEditor, type EditorHandle } from './RecordEditor'

type Intent = { kind: 'open'; id: string } | { kind: 'create' } | { kind: 'exit' }
export function LibraryWorkspace() {
  const [records, setRecords] = useState<RecordSummary[]>([])
  const [record, setRecord] = useState<RecordFile | null>(null)
  const [opened, setOpened] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Intent | null>(null)
  const [working, setWorking] = useState(false)
  const [exported, setExported] = useState(false)
  const editor = useRef<EditorHandle>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (pending) dialog.current?.showModal() }, [pending])
  const dirty = useRef(false), busy = useRef(false), navigating = useRef(false)
  const createRequest = useRef<string | null>(null)
  const refresh = useCallback(async (offset = 0) => {
    const items = await libraryApi.list(offset)
    setRecords(old => offset === 0 ? items : [...old, ...items.filter(item => !old.some(r => r.id === item.id))])
    setHasMore(items.length === 100)
  }, [])
  useEffect(() => {
    if (!desktopAvailable) { setLoading(false); return }
    let alive = true
    void refresh().catch(cause => { if (alive) setError(errorMessage(cause)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refresh])
  const execute = async (intent: Intent) => {
    if (navigating.current || busy.current) return
    navigating.current = true; setWorking(true); setError('')
    try {
      if (intent.kind === 'exit') { await libraryApi.exit(); return }
      let next: RecordFile
      if (intent.kind === 'create') {
        createRequest.current ??= crypto.randomUUID()
        next = await libraryApi.create(createRequest.current, localDate(), Intl.DateTimeFormat().resolvedOptions().timeZone)
        createRequest.current = null
      } else { next = await libraryApi.read(intent.id) }
      dirty.current = false; setRecord(next); setOpened(value => value + 1); setPending(null); setExported(false)
      void refresh().catch(cause => setError(errorMessage(cause)))
    } catch (cause) { setError(errorMessage(cause)) }
    finally { navigating.current = false; setWorking(false) }
  }
  const request = (intent: Intent) => {
    if (navigating.current || busy.current) return
    if (dirty.current) { setPending(intent); setExported(false) } else { void execute(intent) }
  }
  const requestRef = useRef(request); requestRef.current = request
  useEffect(() => {
    if (!desktopAvailable) return
    let disposed = false
    const subscriptions = [
      listen('exit-requested', () => requestRef.current({ kind: 'exit' })),
      listen('save-requested', () => { void editor.current?.save() }),
      listen('new-record-requested', () => requestRef.current({ kind: 'create' })),
    ]
    for (const subscription of subscriptions) void subscription.then(unlisten => { if (disposed) unlisten() }).catch(cause => setError(`关闭保护不可用：${errorMessage(cause)}`))
    return () => { disposed = true; for (const subscription of subscriptions) void subscription.then(unlisten => unlisten()).catch(() => {}) }
  }, [])
  const saveAndContinue = async () => {
    const intent = pending
    if (!intent || !editor.current) return
    if (await editor.current.save()) await execute(intent)
  }
  const onDirty = useCallback((value: boolean) => { dirty.current = value; if (value) setExported(false) }, [])
  const onBusy = useCallback((value: boolean) => { busy.current = value; setWorking(value) }, [])
  const onSaved = useCallback(() => { void refresh().catch(cause => setError(errorMessage(cause))) }, [refresh])
  return <main className="flex h-dvh min-h-0 flex-col">
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-5">
      <span className="text-sm font-semibold tracking-tight">LifeStory Studio <span className="ml-3 font-normal text-muted-foreground">/ 资料库</span></span>
      <span className="text-xs text-muted-foreground">本地保存</span>
    </header>
    {!desktopAvailable ? <p role="status" className="p-8">请在桌面应用中使用本地资料库。浏览器预览不提供模拟数据。</p> : <div className="flex min-h-0 flex-1">
      <aside className="flex w-64 shrink-0 flex-col border-r lg:w-72" aria-label="记录列表">
        <div className="flex items-center justify-between border-b px-4 py-3"><h1 className="text-sm font-semibold">文字记录</h1><Button size="sm" disabled={working || loading} onClick={() => request({ kind: 'create' })}>新建记录</Button></div>
        {error && <div role="alert" className="border-b p-3 text-xs text-destructive">{error}<button className="ml-2 underline" onClick={() => { void refresh().then(() => setError('')).catch(cause => setError(errorMessage(cause))) }}>刷新列表</button></div>}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? <p role="status" className="p-3 text-sm text-muted-foreground">正在读取记录…</p> : records.length === 0 ? <p className="px-3 py-6 text-sm leading-6 text-muted-foreground">还没有记录。<br />从今天的一段经历开始。</p> : records.map(item => <button key={item.id} aria-current={record?.id === item.id ? 'true' : undefined} disabled={working} onClick={() => request({ kind: 'open', id: item.id })} className={`mb-1 block w-full rounded px-3 py-3 text-left transition-colors hover:bg-secondary ${record?.id === item.id ? 'bg-secondary' : ''}`}>
            <span className="mb-1 block text-[11px] tabular-nums text-muted-foreground">{item.recordDate}</span>
            <span className="block truncate text-sm font-medium">{item.title || item.excerpt.split('\n')[0] || '无标题记录'}</span>
            {item.title && <span className="mt-1 block truncate text-xs text-muted-foreground">{item.excerpt}</span>}
          </button>)}
          {hasMore && <Button variant="ghost" disabled={working} onClick={() => { void refresh(records.length).catch(cause => setError(errorMessage(cause))) }}>加载更多</Button>}
        </div>
        <p className="border-t p-4 text-[11px] leading-5 text-muted-foreground">文字记录 · 按记录日期排列<br />记录保存在这台电脑上</p>
      </aside>
      <section className="flex min-w-0 flex-1 overflow-y-auto" aria-label="编辑工作区">
        {record ? <RecordEditor key={`${record.id}:${opened}`} ref={editor} record={record} onDirty={onDirty} onBusy={onBusy} onSaved={onSaved} onFailure={setError} /> : <div className="m-auto max-w-sm px-8"><p className="mb-2 text-xs text-muted-foreground">你的生活，逐篇积累</p><h2 className="mb-3 text-xl font-medium">选择记录，或开始书写。</h2><p className="text-sm leading-7 text-muted-foreground">同一天可以留下多条记录。标题和标签都可稍后补充。</p></div>}
      </section>
    </div>}
    {pending && <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!working) setPending(null) }} aria-labelledby="leave-title" className="fixed inset-0 z-50 m-auto w-[calc(100%-3rem)] max-w-lg rounded-lg border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/25">
      <h2 id="leave-title" className="text-lg font-semibold">有尚未保存的修改</h2><p className="my-3 text-sm leading-6 text-muted-foreground">保存成功后再继续，或主动另存当前编辑内容。放弃修改后，未保存的内容将被丢弃。</p>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {exported && <p role="status" className="mb-3 text-sm text-primary">已另存到你选择的文件；资料库中的修改仍未保存。</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={working} onClick={() => void saveAndContinue()}>保存并继续</Button><Button variant="secondary" disabled={working} onClick={() => { setWorking(true); void editor.current?.export().then(result => { setExported(result) }).finally(() => setWorking(false)) }}>主动另存</Button><Button variant="outline" disabled={working} onClick={() => setPending(null)}>继续编辑</Button><Button variant="ghost" disabled={working} onClick={() => void execute(pending)}>放弃修改并继续</Button></div>
    </dialog>}
  </main>
}
