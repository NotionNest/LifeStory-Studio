import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Button } from '@/components/ui/button'
import { desktopAvailable } from '@/shared/runtime'
import { libraryApi, localDate, errorMessage, type RecordFile, type ContentPreview, type RecordKind, type EditingSession, type RecoveryDraft, type RecoverySummary, type AttachmentOperation, type ImportReport, type DeleteImpact } from './api'
import { AttachmentSync } from './ImageImportSync'
import { TrashPanel, DeleteRecordDialog } from './TrashPanel'
import { HistoryPanel } from './HistoryPanel'
import { RecoveryPreview } from './RecoveryPreview'
import { useLibraryQuery } from './useLibraryQuery'
import { LibraryBrowser } from './LibraryBrowser'
import { LibraryContentPreview } from './LibraryContentPreview'
import { RecordEditor, type EditorHandle } from './RecordEditor'

type Intent = { kind: 'open'; id: string; recordKind?:RecordKind } | { kind: 'create' } | { kind: 'exit' } | { kind: 'history' } | {kind:'navigate';page:'diary'|'chat'|'settings'} | {kind:'chat';id:string} | {kind:'trash'} | {kind:'delete';id:string} | { kind: 'import'; recordId: string; files: File[]; position: number }
export interface LibraryHandle {navigate:(page:'diary'|'chat'|'settings')=>void;openDiary:(id:string)=>void;exit:()=>void}
export const LibraryWorkspace=forwardRef<LibraryHandle,{active?:boolean;onNavigate?:(page:'diary'|'chat'|'settings')=>void;onChat?:(id:string)=>void;managedExit?:boolean}>(function LibraryWorkspace({active=true,onNavigate,onChat,managedExit=false},ref) {
  const browser=useLibraryQuery()
  const {refresh}=browser
  const [preview,setPreview]=useState<ContentPreview|null>(null)
  const [record, setRecord] = useState<RecordFile | null>(null)
  const [session, setSession] = useState<EditingSession | null>(null)
  const [recoveries, setRecoveries] = useState<RecoverySummary[]>([])
  const [recovery, setRecovery] = useState<{ record: RecordFile; draft: RecoveryDraft } | null>(null)
  const [trashOpen,setTrashOpen]=useState(false)
  const [deleteImpact,setDeleteImpact]=useState<DeleteImpact|null>(null)
  const [history, setHistory] = useState<RecordFile | null>(null)
  const historyOpen = useRef(false)
  const attachmentOpen = useRef(false)
  const [attachmentSyncError, setAttachmentSyncError] = useState<{ recordId: string; message: string } | null>(null)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [opened, setOpened] = useState(0)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Intent | null>(null)
  const [working, setWorking] = useState(false)
  const [exported, setExported] = useState(false)
  const editor = useRef<EditorHandle>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (pending) dialog.current?.showModal() }, [pending])
  const dirty = useRef(false), busy = useRef(false), navigating = useRef(false)
  const createRequest = useRef<string | null>(null)
  const queued = useRef<Intent | null>(null)
  const leaving = useRef(false)
  useEffect(() => {
    if (!desktopAvailable) return
    let alive = true
    void libraryApi.recoveries().then(drafts => {
      if (!alive) return
      setRecoveries(drafts)
      if (drafts.length) requestRef.current({ kind: 'open', id: drafts[0].recordId })
    }).catch(cause => { if (alive) setError(errorMessage(cause)) })
    return () => { alive = false }
  }, [refresh])
  const applyEditing = (editing: EditingSession) => {
    dirty.current = false; setPreview(null); setRecord(editing.record); setSession(editing); setOpened(value => value + 1)
  }
  const knownFailure = (cause: unknown) => typeof cause === 'object' && cause !== null && 'code' in cause && ['validation', 'not_found', 'storage_busy', 'storage_full', 'storage_permission', 'storage_corrupt', 'storage_interrupted', 'corrupt_content'].includes(String(cause.code))
  const execute = async (intent: Intent) => {
    if (navigating.current || busy.current) return
    navigating.current = true; setWorking(true); setError('')
    try {
      if (intent.kind === 'exit') { await libraryApi.exit(); return }
      if(intent.kind==='navigate'){setPending(null);onNavigate?.(intent.page);return}
      if(intent.kind==='chat'){setPending(null);onChat?.(intent.id);return}
      if(intent.kind==='trash'){historyOpen.current=true;setTrashOpen(true);setPending(null);return}
      if(intent.kind==='delete'){const impact=await libraryApi.trashImpact(intent.id);historyOpen.current=true;setDeleteImpact(impact);setPending(null);return}
      if (intent.kind === 'history') {
        if (!record || !editor.current) return
        const saved = await libraryApi.read(record.id)
        if (saved.contentVersion !== editor.current.contentVersion()) throw new Error('当前内容已在其他操作中变化，请重新打开记录核对后查看历史')
        historyOpen.current = true; setHistory(saved); setPending(null); return
      }
      if (intent.kind === 'import') {
        if (!record || !session || !editor.current || record.id !== intent.recordId) throw new Error('目标记录已变化，请在原记录中重新选择图片。')
        const saved = await libraryApi.read(record.id)
        if (saved.contentVersion !== editor.current.contentVersion()) throw new Error('当前内容已变化，请重新打开记录核对图片。')
        let editing: EditingSession = { record: saved, sessionId: session.sessionId, recovered: null, recoveredTags: [] }
        const operation = (): AttachmentOperation => ({ recordId: record.id, expectedContentVersion: editing.record.contentVersion, sessionId: editing.sessionId, requestId: crypto.randomUUID() })
        setImportReport({recordId:record.id,messages:['正在插入图片…'],retry:[]})
        const messages: string[] = [], retry: File[] = []
        let position=intent.position
        for (let index = 0; index < intent.files.length; index++) {
          const file = intent.files[index]
          try {
            const input=operation()
            const document=editor.current!.imageDocument(input.requestId,position)
            const result = await libraryApi.importImage(input, file, document)
            editing=result.editing
            position=editor.current!.acceptImage(editing,result.attachmentId,position)
            setRecord(editing.record);setSession(editing)
          } catch (cause) {
            if (knownFailure(cause)) { messages.push(`未成功：${file.name} · ${errorMessage(cause)}`); retry.push(file) }
            else {
              messages.push(`结果尚未确认：${file.name} · ${errorMessage(cause)}。请核对正文，避免重复插入。`)
              try { const current = await libraryApi.read(record.id); editing = await libraryApi.begin(record.id, current.contentVersion); applyEditing(editing) }
              catch (readError) { attachmentOpen.current = true; setAttachmentSyncError({ recordId: record.id, message: errorMessage(readError) }) }
              for (const remaining of intent.files.slice(index + 1)) { retry.push(remaining); messages.push(`尚未处理：${remaining.name}`) }
              break
            }
          }
        }
        setImportReport({ recordId: record.id, messages, retry }); await refresh(); return
      }
      if(intent.kind==='open' && intent.recordKind && intent.recordKind==='conversation'){
        const content=await libraryApi.preview(intent.id)
        setPreview(content);setRecord(null);setSession(null);setPending(null);dirty.current=false;return
      }
      let next: RecordFile
      if (intent.kind === 'create') {
        createRequest.current ??= crypto.randomUUID()
        next = await libraryApi.create(createRequest.current, localDate(), Intl.DateTimeFormat().resolvedOptions().timeZone)
        createRequest.current = null
      } else { next = await libraryApi.read(intent.id) }
      const draft = await libraryApi.recovery(next.id)
      if (draft) { setRecovery({ record: next, draft }); setPending(null); return }
      const editing = await libraryApi.begin(next.id, next.contentVersion)
      dirty.current = false; setPreview(null); setRecord(editing.record); setSession(editing); setOpened(value => value + 1); setPending(null); setExported(false)
      setRecoveries(old => old.filter(item => item.recordId !== next.id))
      void refresh().catch(cause => setError(errorMessage(cause)))
    } catch (cause) { setError(errorMessage(cause)) }
    finally { navigating.current = false; setWorking(leaving.current); if (!leaving.current && queued.current) { const next = queued.current; queued.current = null; queueMicrotask(() => requestRef.current(next)) } }
  }
  const request = (intent: Intent) => {
    if (historyOpen.current || attachmentOpen.current) return
    if (navigating.current || busy.current || leaving.current) { queued.current = intent; return }
    leaving.current = true; setWorking(true)
    void (async () => {
      try {
        if (editor.current && await editor.current.prepareLeave() !== 'saved') {
          if (['history', 'import', 'delete'].includes(intent.kind)) {
            setError('当前修改尚未保存，请先处理保存错误，再查看历史、插入图片或删除记录。')
            if (intent.kind === 'import') setImportReport({ recordId: intent.recordId, messages: ['尚未导入：当前修改保存失败。'], retry: intent.files })
            return
          }
          setPending(intent); setExported(false); return
        }
        await execute(intent)
      } catch (cause) { setError(errorMessage(cause)) }
      finally {
        if (!historyOpen.current && !attachmentOpen.current) editor.current?.resume()
        else if (attachmentOpen.current) { await editor.current?.prepareLeave() }
        leaving.current = false; setWorking(false)
        if (queued.current) { const next = queued.current; queued.current = null; queueMicrotask(() => requestRef.current(next)) }
      }
    })()
  }
  const requestRef = useRef(request); requestRef.current = request
  useEffect(() => {
    if (!desktopAvailable || !active) return
    let disposed = false
    const subscriptions = [
      ...(!managedExit?[listen('exit-requested', () => requestRef.current({ kind: 'exit' }))]:[]),
      listen('save-requested', () => { if (!historyOpen.current && !attachmentOpen.current) void editor.current?.save() }),
      listen('new-record-requested', () => requestRef.current({ kind: 'create' })),
    ]
    for (const subscription of subscriptions) void subscription.then(unlisten => { if (disposed) unlisten() }).catch(cause => setError(`关闭保护不可用：${errorMessage(cause)}`))
    return () => { disposed = true; for (const subscription of subscriptions) void subscription.then(unlisten => unlisten()).catch(() => {}) }
  }, [active,managedExit])
  useImperativeHandle(ref,()=>({navigate:page=>requestRef.current({kind:'navigate',page}),openDiary:id=>requestRef.current({kind:'open',id,recordKind:'text'}),exit:()=>requestRef.current({kind:'exit'})}),[])
  useEffect(()=>{if(!active)return;void refresh();let valid=true;if(record&&editor.current)void libraryApi.read(record.id).then(current=>{if(valid&&editor.current&&current.contentVersion!==editor.current.contentVersion())requestRef.current({kind:'open',id:record.id,recordKind:'text'})}).catch(cause=>{if(valid)setError(errorMessage(cause))});return()=>{valid=false}},[active,record?.id,refresh])
  const refreshBrowser=useCallback(()=>{void refresh()},[refresh])
  const closeTrash=()=>{historyOpen.current=false;setTrashOpen(false);setDeleteImpact(null);editor.current?.resume()}
  const saveAndContinue = () => { if (pending) request(pending) }
  const onDirty = useCallback((value: boolean) => { dirty.current = value; if (value) setExported(false) }, [])
  const onBusy = useCallback((value: boolean) => {
    busy.current = value; setWorking(value || leaving.current || navigating.current)
    if (!value && queued.current) { const intent = queued.current; queued.current = null; queueMicrotask(() => requestRef.current(intent)) }
  }, [])
  const discardAndContinue = async () => {
    const intent = pending
    if (!intent || !editor.current || busy.current) return
    setWorking(true)
    const discarded = await editor.current.discard()
    if (discarded) { dirty.current = false; setRecord(null); setSession(null); setPending(null); await execute(intent) }
    setWorking(false)
  }
  const resolveRecovery = async (action: 'restore' | 'discard') => {
    if (!recovery || navigating.current) return
    navigating.current = true; setWorking(true); setError('')
    try {
      const editing = await libraryApi.begin(recovery.record.id, recovery.record.contentVersion, { sessionId: recovery.draft.sessionId, editSequence: recovery.draft.editSequence, action })
      dirty.current = Boolean(editing.recovered)
      setPreview(null); setRecord(editing.record); setSession(editing); setOpened(value => value + 1); setRecovery(null)
      setRecoveries(old => old.filter(item => item.recordId !== editing.record.id))
    } catch (cause) { setError(errorMessage(cause)) }
    finally { navigating.current = false; setWorking(leaving.current); if (!leaving.current && queued.current) { const next = queued.current; queued.current = null; queueMicrotask(() => requestRef.current(next)) } }
  }
  const rereadAttachments = async () => {
    const recordId = attachmentSyncError?.recordId
    if (!recordId || navigating.current) return
    navigating.current = true; setWorking(true)
    try {
      const current = await libraryApi.read(recordId)
      const editing = await libraryApi.begin(recordId, current.contentVersion)
      attachmentOpen.current = false; setAttachmentSyncError(null); applyEditing(editing); setError(''); await refresh().catch(cause => setError(`内容已读取，记录列表刷新失败：${errorMessage(cause)}`))
    } catch (cause) {
      setError(errorMessage(cause)); if (attachmentSyncError) setAttachmentSyncError({ recordId, message: errorMessage(cause) })
    } finally { navigating.current = false; setWorking(false) }
  }
  const onSaved = useCallback(() => { setError(''); void refresh().catch(cause => setError(errorMessage(cause))) }, [refresh])
  return <main className="flex h-full min-h-0 flex-col">
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-5 py-2">
      <span className="text-sm font-semibold tracking-tight">日记</span>
      <div className="flex flex-wrap items-center gap-2">{record&&<Button variant="outline" size="sm" disabled={working} onClick={()=>request({kind:'chat',id:record.id})}>聊聊这篇日记</Button>}{(record||preview)&&<Button size="sm" variant="ghost" disabled={working} onClick={()=>request({kind:'delete',id:(record?.id??preview!.id)})}>删除日记</Button>}<Button size="sm" variant="outline" disabled={working} onClick={()=>request({kind:'trash'})}>日记回收站</Button><span className="text-xs text-muted-foreground">本地保存</span></div>
    </header>
    {!desktopAvailable ? <p role="status" className="p-8">请在桌面应用中使用本地资料库。浏览器预览不提供模拟数据。</p> : <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r lg:w-[22rem]" aria-label="记录列表">
        {error && <div role="alert" className="border-b p-3 text-xs text-destructive">{error}<button className="ml-2 underline" onClick={() => { void refresh().then(() => setError('')).catch(cause => setError(errorMessage(cause))) }}>刷新列表</button></div>}
        {recoveries.length > 0 && <section aria-label="待恢复草稿" className="border-b px-4 py-3"><p className="mb-2 text-xs font-semibold">本机有待处理的恢复草稿</p>{recoveries.map(item => <button key={item.recordId} disabled={working} className="mb-1 block w-full truncate text-left text-xs underline" onClick={() => request({ kind: 'open', id: item.recordId })}>{item.title || '无标题记录'} · {new Date(item.writtenAt).toLocaleString()}</button>)}</section>}
        <LibraryBrowser browser={browser} selectedId={record?.id??preview?.id} working={working} onCreate={()=>request({kind:'create'})} onOpen={item=>request({kind:'open',id:item.id,recordKind:item.kind})}/>

      </aside>
      <section className="flex min-w-0 flex-1 overflow-y-auto" aria-label="编辑工作区">
        {preview ? <LibraryContentPreview key={preview.id} content={preview}/> : record && session ? <RecordEditor key={`${record.id}:${opened}`} ref={editor} record={record} sessionId={session.sessionId} recovered={session.recovered} recoveredTags={session.recoveredTags} onDirty={onDirty} onBusy={onBusy} onSaved={onSaved} onFailure={setError} onHistory={() => request({ kind: 'history' })} onImport={(files, position) => request({ kind: 'import', recordId: record.id, files, position })} importReport={importReport?.recordId === record.id ? importReport : null} /> : <div className="m-auto max-w-sm px-8"><p className="mb-2 text-xs text-muted-foreground">你的生活，逐篇积累</p><h2 className="mb-3 text-xl font-medium">选择记录，或开始书写。</h2><p className="text-sm leading-7 text-muted-foreground">同一天可以留下多条记录。标题和标签都可稍后补充。</p></div>}
      </section>
    </div>}
    {attachmentSyncError && <AttachmentSync busy={working} error={attachmentSyncError.message} onReread={() => void rereadAttachments()} />}
    {history && session && <HistoryPanel record={history} sessionId={session.sessionId} onClose={() => { historyOpen.current = false; setHistory(null); editor.current?.resume() }} onRestored={editing => {
      historyOpen.current = false; setHistory(null); applyEditing(editing); setError(''); onSaved()
    }} />}

    {trashOpen&&<TrashPanel onClose={closeTrash} onChanged={refreshBrowser}/>}
    {deleteImpact&&<DeleteRecordDialog impact={deleteImpact} onClose={closeTrash} onDeleted={()=>{const id=deleteImpact.recordId;setRecord(null);setSession(null);setPreview(null);dirty.current=false;setRecoveries(old=>old.filter(r=>r.recordId!==id));closeTrash();void refresh()}}/>}
    {recovery && <RecoveryPreview record={recovery.record} draft={recovery.draft} busy={working} error={error} onChoose={action => void resolveRecovery(action)} onCancel={() => { setRecovery(null); setError('') }} onRefresh={() => void execute({ kind: 'open', id: recovery.record.id })} />}
    {pending && <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!working) setPending(null) }} aria-labelledby="leave-title" className="fixed inset-0 z-50 m-auto w-[calc(100%-3rem)] max-w-lg rounded-lg border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/25">
      <h2 id="leave-title" className="text-lg font-semibold">有尚未保存的修改</h2><p className="my-3 text-sm leading-6 text-muted-foreground">保存成功后再继续，或主动另存当前编辑内容。放弃修改后，未保存的内容将被丢弃。</p>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {exported && <p role="status" className="mb-3 text-sm text-primary">已另存到你选择的文件；资料库中的修改仍未保存。</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={working} onClick={() => void saveAndContinue()}>保存并继续</Button><Button variant="secondary" disabled={working} onClick={() => { setWorking(true); void editor.current?.export().then(result => { setExported(result) }).finally(() => setWorking(false)) }}>主动另存</Button><Button variant="outline" disabled={working} onClick={() => setPending(null)}>继续编辑</Button><Button variant="ghost" disabled={working} onClick={() => void discardAndContinue()}>放弃修改并继续</Button></div>
    </dialog>}
  </main>
})
