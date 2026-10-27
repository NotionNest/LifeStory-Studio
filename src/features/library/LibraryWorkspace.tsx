import { MessageCircleIcon, Trash2Icon, PenLineIcon, ArrowLeftIcon, PencilIcon, HistoryIcon } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { PageActions, type PageAction } from '@/app/PageActions'
import { Button } from '@/components/ui/button'
import { desktopAvailable } from '@/shared/runtime'
import { libraryApi, localDate, errorMessage, type RecordFile, type ContentPreview, type RecordKind, type EditingSession, type RecoveryDraft, type RecoverySummary, type AttachmentOperation, type ImportReport, type DeleteImpact } from './api'
import { AttachmentSync } from './ImageImportSync'
import { DeleteRecordDialog } from './TrashPanel'
import { HistoryPage, type HistoryHandle } from './HistoryPage'
import { RecoveryPreview } from './RecoveryPreview'
import { useLibraryQuery } from './useLibraryQuery'
import { LibraryBrowser } from './LibraryBrowser'
import { LibraryContentPreview } from './LibraryContentPreview'
import { RecordEditor, type EditorHandle } from './RecordEditor'

type Intent = { kind: 'open'; id: string; recordKind?:RecordKind; from?:'chat' } | { kind: 'create'; date?: string } | {kind:'action';action:()=>void} | { kind: 'home' } | { kind: 'exit' } | { kind: 'history' } | {kind:'navigate';page:'diary'|'chat'|'settings'} | {kind:'chat';id:string} | {kind:'delete';id:string} | { kind: 'import'; recordId: string; files: File[]; position: number }
export interface LibraryHandle {withSavedDiary:(action:()=>Promise<void>)=>Promise<void>;create:()=>void;run:(action:()=>void)=>void;navigate:(page:'diary'|'chat'|'settings')=>void;openDiary:(id:string,from?:'chat')=>void;home:()=>void;exit:()=>void}
export const LibraryWorkspace=forwardRef<LibraryHandle,{active?:boolean;onNavigate?:(page:'diary'|'chat'|'settings')=>void;onChat?:(id:string)=>void;managedExit?:boolean;titlebarTarget?:HTMLElement|null;onRecordChange?:(id:string|null)=>void}>(function LibraryWorkspace({active=true,onNavigate,onChat,managedExit=false,titlebarTarget=null,onRecordChange},ref) {
  const [mode,setMode]=useState<'home'|'detail'|'history'>('home')
  const [origin,setOrigin]=useState<'chat'|null>(null)
  const endedSession=useRef<string|null>(null)
  const browser=useLibraryQuery(active&&mode==='home')
  const {refresh}=browser
  const [preview,setPreview]=useState<ContentPreview|null>(null)
  const [record, setRecord] = useState<RecordFile | null>(null)
  const [session, setSession] = useState<EditingSession | null>(null)
  const [recoveries, setRecoveries] = useState<RecoverySummary[]>([])
  const [recovery, setRecovery] = useState<{ record: RecordFile; draft: RecoveryDraft } | null>(null)
  const [deleteImpact,setDeleteImpact]=useState<DeleteImpact|null>(null)
  const [chatSyncError,setChatSyncError]=useState('')
  const preservedScroll=useRef<number|null>(null)
  useEffect(()=>onRecordChange?.(mode==='detail'?record?.id??null:null),[mode,record?.id,onRecordChange])
  const [history, setHistory] = useState<RecordFile | null>(null)
  const historyOpen = useRef(false),historyPage=useRef<HistoryHandle>(null)
  const attachmentOpen = useRef(false)
  const [attachmentSyncError, setAttachmentSyncError] = useState<{ recordId: string; message: string } | null>(null)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [opened, setOpened] = useState(0)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Intent | null>(null)
  const [working, setWorking] = useState(false)
  const [exported, setExported] = useState(false)
  const detail=useRef<HTMLElement>(null),detailScroll=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(active&&mode==='detail'){if(preservedScroll.current!==null){if(detailScroll.current)detailScroll.current.scrollTop=preservedScroll.current;preservedScroll.current=null;return}if(detailScroll.current)detailScroll.current.scrollTop=0;detail.current?.querySelector<HTMLInputElement>('[aria-label="记录标题"]')?.focus({preventScroll:true})}},[active,mode,opened])
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
    }).catch(cause => { if (alive) setError(errorMessage(cause)) })
    return () => { alive = false }
  }, [refresh])
  const applyEditing = (editing: EditingSession) => {
    setChatSyncError(''); dirty.current = false; setMode('detail'); setPreview(null); setRecord(editing.record); setSession(editing); setOpened(value => value + 1)
  }
  const knownFailure = (cause: unknown) => typeof cause === 'object' && cause !== null && 'code' in cause && ['validation', 'not_found', 'storage_busy', 'storage_full', 'storage_permission', 'storage_corrupt', 'storage_interrupted', 'corrupt_content'].includes(String(cause.code))
  const showHome = async () => {
    if(record&&session&&endedSession.current!==session.sessionId){
      await libraryApi.end(record.id,session.sessionId)
      endedSession.current=session.sessionId
    }
    setChatSyncError('');dirty.current=false;setRecord(null);setSession(null);setPreview(null);setPending(null);setMode('home');setOrigin(null)
  }
  const execute = async (intent: Intent) => {
    if (navigating.current || busy.current) return
    navigating.current = true; setWorking(true); setError('')
    try {
      if (intent.kind === 'exit') { await libraryApi.exit(); return }
      if(intent.kind==='action'){await showHome();intent.action();return}
      if(intent.kind==='home'){await showHome();onNavigate?.('diary');return}
      if(intent.kind==='navigate'){await showHome();onNavigate?.(intent.page);return}
      if(intent.kind==='chat'){onChat?.(intent.id);return}
      if(intent.kind==='delete'){const impact=await libraryApi.trashImpact(intent.id);historyOpen.current=true;setDeleteImpact(impact);setPending(null);return}
      if (intent.kind === 'history') {
        if (!record || !editor.current) return
        const saved = await libraryApi.read(record.id)
        if (saved.contentVersion !== editor.current.contentVersion()) throw new Error('当前内容已在其他操作中变化，请重新打开记录核对后查看历史')
        preservedScroll.current=detailScroll.current?.scrollTop??0;historyOpen.current = true; setHistory(saved);setMode('history'); setPending(null); return
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
        setMode('detail');setPreview(content);setRecord(null);setSession(null);setPending(null);dirty.current=false;return
      }
      let next: RecordFile
      if (intent.kind === 'create') {
        createRequest.current ??= crypto.randomUUID()
        next = await libraryApi.create(createRequest.current, intent.date??localDate(), Intl.DateTimeFormat().resolvedOptions().timeZone)
        createRequest.current = null
      } else { next = await libraryApi.read(intent.id) }
      const draft = await libraryApi.recovery(next.id)
      if (draft) { setRecovery({ record: next, draft }); setPending(null); return }
      const editing = await libraryApi.begin(next.id, next.contentVersion)
      setChatSyncError(''); dirty.current = false; setMode('detail'); setOrigin(intent.kind==='open'?intent.from??null:null); setPreview(null); setRecord(editing.record); setSession(editing); setOpened(value => value + 1); setPending(null); setExported(false)
      setRecoveries(old => old.filter(item => item.recordId !== next.id))
      void refresh().catch(cause => setError(errorMessage(cause)))
    } catch (cause) { setError(errorMessage(cause)) }
    finally { navigating.current = false; setWorking(leaving.current); if (!leaving.current && queued.current) { const next = queued.current; queued.current = null; queueMicrotask(() => requestRef.current(next)) } }
  }
  const request = (intent: Intent) => {
    if(attachmentOpen.current)return
    if(historyOpen.current){
      if(!historyPage.current?.canLeave())return
      historyOpen.current=false;setHistory(null);setMode('detail')
      if(intent.kind!=='history')preservedScroll.current=null
    }
    if (navigating.current || busy.current || leaving.current) { queued.current = intent; return }
    leaving.current = true; setWorking(true)
    void (async () => {
      try {
        if (editor.current && await editor.current.prepareLeave() !== 'saved') {
          if (['history', 'import', 'delete', 'chat'].includes(intent.kind)) {
            setError('当前修改尚未保存，请先处理保存错误，再查看历史、插入图片、删除记录或打开聊天。')
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
  const reloadAfterChat=async()=>{
    if(!record||!editor.current)return
    const current=await libraryApi.read(record.id)
    if(current.contentVersion!==editor.current.contentVersion()){
      const editing=await libraryApi.begin(record.id,current.contentVersion)
      preservedScroll.current=detailScroll.current?.scrollTop??0
      applyEditing(editing)
    }
    setChatSyncError('');editor.current?.resume()
  }
  const withSavedDiary=async(action:()=>Promise<void>)=>{
    if(busy.current||navigating.current||leaving.current||historyOpen.current||attachmentOpen.current||chatSyncError)throw new Error('请先完成日记中的当前操作。')
    navigating.current=true;setWorking(true)
    let prepared=false,synced=false
    try{
      if(editor.current&&await editor.current.prepareLeave()!=='saved')throw new Error('日记尚未保存，请先处理保存错误。')
      prepared=true
      await action()
    }finally{
      try{if(prepared)await reloadAfterChat();else editor.current?.resume();synced=true}
      catch(cause){setChatSyncError(errorMessage(cause));throw cause}
      finally{navigating.current=false;setWorking(false);if(synced&&queued.current){const next=queued.current;queued.current=null;queueMicrotask(()=>requestRef.current(next))}}
    }
  }
  const syncDiaryRef=useRef(withSavedDiary);syncDiaryRef.current=withSavedDiary
  useImperativeHandle(ref,()=>({withSavedDiary:action=>syncDiaryRef.current(action),create:()=>requestRef.current({kind:'create'}),run:action=>requestRef.current({kind:'action',action}),navigate:page=>requestRef.current({kind:'navigate',page}),openDiary:(id,from)=>requestRef.current({kind:'open',id,recordKind:'text',from}),home:()=>requestRef.current({kind:'home'}),exit:()=>requestRef.current({kind:'exit'})}),[])
  useEffect(()=>{if(!active)return;void refresh();let valid=true;if(record&&editor.current)void libraryApi.read(record.id).then(current=>{if(valid&&editor.current&&current.contentVersion!==editor.current.contentVersion())requestRef.current({kind:'open',id:record.id,recordKind:'text'})}).catch(cause=>{if(valid)setError(errorMessage(cause))});return()=>{valid=false}},[active,record?.id,refresh])
  const closeDelete=()=>{historyOpen.current=false;setDeleteImpact(null);editor.current?.resume()}
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
    if (discarded) { endedSession.current=session?.sessionId??null; dirty.current = false; setRecord(null); setSession(null); setPending(null); await execute(intent) }
    setWorking(false)
  }
  const resolveRecovery = async (action: 'restore' | 'discard') => {
    if (!recovery || navigating.current) return
    navigating.current = true; setWorking(true); setError('')
    try {
      const editing = await libraryApi.begin(recovery.record.id, recovery.record.contentVersion, { sessionId: recovery.draft.sessionId, editSequence: recovery.draft.editSequence, action })
      dirty.current = Boolean(editing.recovered)
      setMode('detail');setPreview(null); setRecord(editing.record); setSession(editing); setOpened(value => value + 1); setRecovery(null)
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
  const actions:PageAction[]=[]
  const actionDisabled=working||Boolean(chatSyncError)||Boolean(history||deleteImpact||pending||recovery||attachmentSyncError)
  if(record){
    actions.push({id:'chat',label:'聊聊这篇日记',icon:MessageCircleIcon,primary:true,disabled:actionDisabled,onSelect:()=>requestRef.current({kind:'chat',id:record.id})})
    actions.push({id:'rename',label:'重命名',icon:PencilIcon,disabled:actionDisabled,onSelect:()=>{const input=detail.current?.querySelector<HTMLInputElement>('[aria-label="记录标题"]');if(input&&!input.readOnly){input.focus();input.select()}}})
    actions.push({id:'create',label:'新建日记',icon:PenLineIcon,disabled:actionDisabled,onSelect:()=>requestRef.current({kind:'create'})})
    actions.push({id:'history',label:'查看历史',icon:HistoryIcon,disabled:actionDisabled,onSelect:()=>requestRef.current({kind:'history'})})
  }
  if(record||preview)actions.push({id:'delete',label:'删除日记',icon:Trash2Icon,destructive:true,disabled:actionDisabled,onSelect:()=>requestRef.current({kind:'delete',id:record?.id??preview!.id})})
  return <main className="flex h-full min-h-0 flex-col">
    {active&&mode==='detail'&&<PageActions key={record?.id??preview?.id} target={titlebarTarget} actions={actions}/>}
    {!desktopAvailable ? <p role="status" className="p-8">请在桌面应用中打开资料库。</p> : <div hidden={mode==='history'} className="flex min-h-0 flex-1 flex-col">
      {chatSyncError&&<div role="alert" className="flex shrink-0 items-center gap-2 border-b px-6 py-3 text-sm text-destructive">{chatSyncError}<Button size="sm" variant="ghost" disabled={working} onClick={()=>{setWorking(true);void reloadAfterChat().catch(cause=>setChatSyncError(errorMessage(cause))).finally(()=>setWorking(false))}}>重新读取日记</Button></div>}
      {error && <div role="alert" className="flex shrink-0 items-center gap-2 border-b px-6 py-3 text-sm text-destructive">{error}<Button size="sm" variant="ghost" onClick={()=>{setError('');void refresh()}}>刷新列表</Button></div>}
      <section aria-label="日记首页" hidden={mode!=='home'} className="flex min-h-0 flex-1 flex-col">
        {recoveries.length>0&&<section aria-label="待恢复草稿" className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-3"><h2 className="text-sm font-medium">待恢复草稿</h2>{recoveries.map(item=><Button key={item.recordId} size="sm" variant="ghost" disabled={working} onClick={()=>request({kind:'open',id:item.recordId})}>{item.title||'无标题记录'} · {new Date(item.writtenAt).toLocaleString()}</Button>)}</section>}
        <LibraryBrowser browser={browser} active={active&&mode==='home'} working={working} onCreate={date=>request({kind:'create',date})} onOpen={item=>{setOrigin(null);request({kind:'open',id:item.id,recordKind:item.kind})}}/>
      </section>
      <section ref={detail} aria-label="编辑工作区" hidden={mode!=='detail'} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="workspace-toolbar"><Button variant="ghost" size="sm" disabled={working} onClick={()=>request({kind:'home'})}><ArrowLeftIcon data-icon="inline-start" aria-hidden="true"/>返回日记</Button>{origin==='chat'&&<Button variant="ghost" size="sm" disabled={working} onClick={()=>request({kind:'navigate',page:'chat'})}>返回聊天</Button>}{record&&<time dateTime={new Date(record.createdAt).toISOString()} className="ml-auto text-xs text-muted-foreground">创建于 {new Date(record.createdAt).toLocaleString()}</time>}</header>
        <div ref={detailScroll} className="flex min-h-0 flex-1 overflow-y-auto">
        {preview ? <LibraryContentPreview key={preview.id} content={preview}/> : record && session ? <RecordEditor key={`${record.id}:${opened}`} ref={editor} record={record} sessionId={session.sessionId} recovered={session.recovered} recoveredTags={session.recoveredTags} onDirty={onDirty} onBusy={onBusy} onSaved={onSaved} onFailure={setError} onImport={(files, position) => request({ kind: 'import', recordId: record.id, files, position })} importReport={importReport?.recordId === record.id ? importReport : null} /> : <p role="status" className="p-8 text-sm text-muted-foreground">正在打开日记…</p>}
        </div>
      </section>
    </div>}
    {attachmentSyncError && <AttachmentSync busy={working} error={attachmentSyncError.message} onReread={() => void rereadAttachments()} />}
    {history && session && <HistoryPage ref={historyPage} record={history} sessionId={session.sessionId} onClose={() => { historyOpen.current = false; setHistory(null);setMode('detail');editor.current?.resume();requestAnimationFrame(()=>{const trigger=titlebarTarget?.querySelector<HTMLButtonElement>('[aria-label="更多操作"]');if(trigger)trigger.focus({preventScroll:true});else detail.current?.querySelector<HTMLInputElement>('[aria-label="记录标题"]')?.focus({preventScroll:true})}) }} onRestored={editing => {
      historyOpen.current = false; setHistory(null); applyEditing(editing); setError(''); onSaved()
    }} />}

    {deleteImpact&&<DeleteRecordDialog impact={deleteImpact} onClose={closeDelete} onDeleted={()=>{const id=deleteImpact.recordId;setRecord(null);setSession(null);setPreview(null);setMode('home');setOrigin(null);dirty.current=false;setRecoveries(old=>old.filter(r=>r.recordId!==id));closeDelete();void refresh()}}/>}
    {recovery && <RecoveryPreview record={recovery.record} draft={recovery.draft} busy={working} error={error} onChoose={action => void resolveRecovery(action)} onCancel={() => { setRecovery(null); setError('') }} onRefresh={() => void execute({ kind: 'open', id: recovery.record.id })} />}
    {pending && <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!working) setPending(null) }} aria-labelledby="leave-title" className="fixed inset-0 z-50 m-auto w-[calc(100%-3rem)] max-w-lg rounded-lg border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/25">
      <h2 id="leave-title" className="text-lg font-semibold">有尚未保存的修改</h2><p className="my-3 text-sm leading-6 text-muted-foreground">保存成功后再继续，或主动另存当前编辑内容。放弃修改后，未保存的内容将被丢弃。</p>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {exported && <p role="status" className="mb-3 text-sm text-primary">已另存到你选择的文件；资料库中的修改仍未保存。</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={working} onClick={() => void saveAndContinue()}>保存并继续</Button><Button variant="secondary" disabled={working} onClick={() => { setWorking(true); void editor.current?.export().then(result => { setExported(result) }).finally(() => setWorking(false)) }}>主动另存</Button><Button variant="outline" disabled={working} onClick={() => setPending(null)}>继续编辑</Button><Button variant="ghost" disabled={working} onClick={() => void discardAndContinue()}>放弃修改并继续</Button></div>
    </dialog>}
  </main>
})
