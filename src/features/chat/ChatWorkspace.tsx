import { MessageDetails, ReasoningSummary } from './MessageDetails'
import { ChatModelControls } from './ChatModelControls'
import { PageActions, type PageAction } from '@/app/PageActions'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { SearchHighlight } from '@/shared/SearchHighlight'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpIcon, PlusIcon, ImagePlusIcon, BookOpenIcon, SquareIcon, PenLineIcon, Trash2Icon, PencilIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton, useMessageScroller } from '@/components/ui/message-scroller'
import { InputGroup, InputGroupTextarea, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import { aiApi, type ModelSelection, type AiProfile, type AiPreferences, type AiWorkspace, type ChatSummary, type DiaryPreview } from '@/features/library/aiApi'
import { libraryApi, localDate, errorMessage, type DeleteImpact, type RecordFile, type SearchItem } from '@/features/library/api'
import { emptyFilters } from '@/features/library/useLibraryQuery'
import { AttachmentSurface, AttachmentImage } from '@/features/library/AttachmentImage'
import { DeleteRecordDialog } from '@/features/library/TrashPanel'
export type ChatIntent = {diaryId:string;nonce:number} | {chatId:string|null;messageId?:string;keyword?:string;nonce:number}
interface Props {titlebarTarget?:HTMLElement|null;onClose?:()=>void;withSavedDiary?:(action:()=>Promise<void>)=>Promise<void>;sidebarOpen?:boolean;active:boolean;profiles:AiProfile[];preferences:AiPreferences;intent:ChatIntent|null;onSettings:()=>void;onOpenDiary:(id:string)=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}
type MessageLocation={messageId:string;keyword:string;nonce:number;located?:boolean;follow?:boolean}
type PreviewMode='create'|'append'|'rewrite'
type QueuedMessage={editingText?:string;recordId:string;input:Parameters<typeof aiApi.send>[0];paused?:boolean;error?:string;continueAfterFailure?:boolean}
export function ChatWorkspace({titlebarTarget=null,active,profiles,preferences,intent,onSettings,onOpenDiary,onDirty,onBusy,sidebarOpen=true,onClose,withSavedDiary}:Props){
 const [id,setId]=useState<string|null>(null),[workspace,setWorkspace]=useState<AiWorkspace|null>(null),[profileId,setProfileId]=useState(''),[text,setText]=useState(''),[sources,setSources]=useState<string[]>([]),[items,setItems]=useState<SearchItem[]>([]),[sourceKeyword,setSourceKeyword]=useState(''),[sourceNext,setSourceNext]=useState<number|null>(null),[chats,setChats]=useState<ChatSummary[]>([]),[next,setNext]=useState<number|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState<DiaryPreview|null>(null),[previewText,setPreviewText]=useState(''),[previewTitle,setPreviewTitle]=useState(''),[previewDate,setPreviewDate]=useState(localDate()),[previewDirty,setPreviewDirty]=useState(false),[materialOpen,setMaterialOpen]=useState(false),[target,setTarget]=useState<string|null>(null),[targetRecord,setTargetRecord]=useState<RecordFile|null>(null),[rename,setRename]=useState<string|null>(null),[deleteImpact,setDeleteImpact]=useState<DeleteImpact|null>(null),[compare,setCompare]=useState<string|null>(null)
 const [queue,setQueue]=useState<QueuedMessage[]>([])
 const [selection,setSelection]=useState<ModelSelection|undefined>(undefined)
 const [localActions,setLocalActions]=useState<HTMLDivElement|null>(null),[targetOpen,setTargetOpen]=useState(false)
 useEffect(()=>{setTargetOpen(false)},[id,active])
 const [location,setLocation]=useState<MessageLocation|null>(null)
 const contextDiary=useRef<string|null>(null),diaryChats=useRef(new Map<string,string>())
 const draftKey=()=>id??(contextDiary.current?`diary:${contextDiary.current}`:'new')
 const savedDiaryAction=async(action:()=>Promise<void>)=>{if(withSavedDiary)await withSavedDiary(action);else await action()}
 const inputRef=useRef<HTMLTextAreaElement>(null)
 useEffect(()=>{if(active&&intent&&(!('messageId' in intent)||!intent.messageId))inputRef.current?.focus()},[active,intent])
 const visiblePreview=useRef(preview);visiblePreview.current=preview
 const loadedChat=useRef<string|null>(null)
 const previewEpoch=useRef(0)
 const alive=useRef(true),current=useRef(id),listSeq=useRef(0),materialSeq=useRef(0),seenIntent=useRef<number|null>(null),sendRequest=useRef<string|null>(null),previewRequest=useRef<string|null>(null),adoptRequest=useRef<string|null>(null),fileInput=useRef<HTMLInputElement>(null),drafts=useRef(new Map<string,{text:string;sources:string[];profileId:string;selection?:ModelSelection}>()),previewCache=useRef(new Map<string,{value:DiaryPreview;text:string;title:string;date:string;dirty:boolean}>()),busyRef=useRef(false)
 current.current=id
 const profile=profiles.find(p=>p.id===profileId&&!p.label.startsWith('[已停用]'))
 const running=workspace?.task?.status==='running'
 const pending=queue.filter(item=>item.recordId===id)
 const head=pending[0]
 const editingQueue=pending.some(item=>item.editingText!==undefined)
 const queueBlocked=editingQueue||Boolean(head&&(head.paused||head.error||(taskStatusBlocked(workspace?.task?.status)&&!head.continueAfterFailure)))
 const task=workspace?.task
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>onBusy(busy),[busy,onBusy])
 useEffect(()=>{onDirty(queue.length>0||Boolean(text.trim())||previewDirty||[...drafts.current.values()].some(d=>d.text.trim())||[...previewCache.current.values()].some(p=>p.dirty))},[text,previewDirty,id,queue,onDirty])
 const updatePreview=(value:DiaryPreview)=>{setPreview(value);setPreviewText(value.text);setPreviewTitle(value.title);setPreviewDate(value.recordDate);setPreviewDirty(false);adoptRequest.current=null}
 const refreshChats=useCallback(async(offset=0)=>{const seq=++listSeq.current;setLoading(true);try{const page=await aiApi.chats('',offset);if(alive.current&&seq===listSeq.current){setChats(old=>offset?[...old,...page.items.filter(i=>!old.some(o=>o.id===i.id))]:page.items);setNext(page.nextOffset)}}catch(e){if(alive.current&&seq===listSeq.current)setError(errorMessage(e))}finally{if(alive.current&&seq===listSeq.current)setLoading(false)}},[])
 const refresh=useCallback(async()=>{const record=current.current;if(!record)return;const w=await aiApi.workspace(record);if(alive.current&&current.current===record)setWorkspace(w)},[])
 useEffect(()=>{if(active)void refreshChats()},[active,refreshChats])
 useEffect(()=>{if(!id||!active)return;let valid=true;setWorkspace(old=>old?.id===id?old:null);void (async()=>{try{const w=await aiApi.workspace(id);if(!valid)return;setWorkspace(w);const showPreview=loadedChat.current!==id||visiblePreview.current!==null;if(loadedChat.current!==id&&!drafts.current.has(id)){setProfileId(w.profileId??'');setSelection(w.effectiveModel?{model:w.effectiveModel,reasoningEffort:w.effectiveEffort??null}:undefined);setSources(w.contextIds??[])}else{setSources(old=>old.filter(source=>!w.sources.some(s=>s.id===source&&s.unavailable)))}loadedChat.current=id;
 const cached=previewCache.current.get(id),candidate=w.previewTaskId??cached?.value.taskId;
 if(candidate&&!(w.task?.status==='running'&&previewRequest.current===w.task.id)){try{const server=await aiApi.preview(candidate);if(!valid)return;if(!showPreview){const keep=cached&&cached.value.taskId===candidate&&!server.adoptedId;previewCache.current.set(id,{value:server,text:keep?cached.text:server.text,title:keep?cached.title:server.title,date:keep?cached.date:server.recordDate,dirty:keep?cached.dirty:false})}else if(cached&&cached.value.taskId===candidate&&!server.adoptedId){setPreview(server);setPreviewText(cached.text);setPreviewTitle(cached.title);setPreviewDate(cached.date);setPreviewDirty(cached.dirty)}else updatePreview(server)}catch(e){if(valid){previewCache.current.delete(id);setPreview(null);setPreviewText('');setPreviewDirty(false);setError(errorMessage(e))}}}
 if(w.linkedDiaryId){setTarget(w.linkedDiaryId);try{const r=await libraryApi.read(w.linkedDiaryId);if(valid)setTargetRecord(r)}catch{if(valid)setTargetRecord(null)}}
 }catch(e){if(valid)setError(errorMessage(e))}})();return()=>{valid=false}},[id,active])
 useEffect(()=>{if(id&&preview)previewCache.current.set(id,{value:preview,text:previewText,title:previewTitle,date:previewDate,dirty:previewDirty})},[id,preview,previewText,previewTitle,previewDate,previewDirty])
 useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>void refresh().catch(e=>{if(alive.current)setError(errorMessage(e))}),400);return()=>window.clearInterval(timer)},[running,refresh])
 useEffect(()=>{if(task?.status==='completed'&&previewRequest.current===task.id){previewRequest.current=null;const epoch=previewEpoch.current,record=current.current;void aiApi.preview(task.id).then(p=>{if(alive.current&&epoch===previewEpoch.current&&current.current===record)updatePreview(p)}).catch(e=>{if(alive.current&&epoch===previewEpoch.current)setError(errorMessage(e))});void refreshChats()}},[task?.status,task?.id,refreshChats])
 const previousDefault=useRef(preferences.defaultProfileId)
 useEffect(()=>{const before=previousDefault.current;previousDefault.current=preferences.defaultProfileId;if(!id&&preferences.defaultProfileId&&(!profileId||(before!==preferences.defaultProfileId&&profileId===before&&profiles.some(p=>p.id===before&&p.label.startsWith('[已停用]')))))setProfileId(preferences.defaultProfileId)},[id,profileId,profiles,preferences.defaultProfileId])
 const stash=()=>{drafts.current.set(draftKey(),{text,sources,profileId,selection});if(id&&preview)previewCache.current.set(id,{value:preview,text:previewText,title:previewTitle,date:previewDate,dirty:previewDirty})}
 const switchChat=(nextId:string|null,context:string|null=null)=>{
  if(busyRef.current)return
  const selected=context?diaryChats.current.get(context)??null:nextId
  if(context===contextDiary.current&&selected===current.current&&(context||selected))return
  setLocation(null);previewEpoch.current++;loadedChat.current=null;stash();contextDiary.current=context
  const saved=drafts.current.get(selected??(context?`diary:${context}`:'new'))
  setSelection(saved?.selection);setId(selected);setWorkspace(null);setText(saved?.text??'');setSources(saved?.sources??(context?[context]:[]));setProfileId(saved?.profileId??(!selected?preferences.defaultProfileId??'':''));setPreview(null);setPreviewDirty(false);setTarget(context);setTargetRecord(null);setRename(null);setCompare(null);setError('');setNotice('');sendRequest.current=null;adoptRequest.current=null;previewRequest.current=null
 }
 useEffect(()=>{
  if(!intent||seenIntent.current===intent.nonce||busyRef.current)return
  seenIntent.current=intent.nonce
  let valid=true
  if('diaryId' in intent){setLocation(null);switchChat(null,intent.diaryId);void libraryApi.read(intent.diaryId).then(record=>{if(valid)setTargetRecord(record)}).catch(e=>{if(valid)setError(errorMessage(e))})}
  else{switchChat(intent.chatId);setLocation(intent.messageId?{messageId:intent.messageId,keyword:intent.keyword??'',nonce:intent.nonce}:null)}
  return()=>{valid=false}
 },[intent])
 const run=async(action:()=>Promise<void>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await action()}catch(e){if(alive.current)setError(errorMessage(e))}finally{busyRef.current=false;if(alive.current)setBusy(false)}}
 const sourceInput=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(materialOpen){const frame=requestAnimationFrame(()=>sourceInput.current?.focus());return()=>cancelAnimationFrame(frame)}},[materialOpen])
 const queryMaterials=async(offset=0,keyword=sourceKeyword)=>{const seq=++materialSeq.current;try{const page=await libraryApi.query({...emptyFilters,keyword,month:null,offset});if(alive.current&&seq===materialSeq.current){setItems(old=>offset?[...old,...page.items.filter(i=>!old.some(o=>o.id===i.id))]:page.items);setSourceNext(page.nextOffset)}}catch(e){if(alive.current)setError(errorMessage(e))}}
 const openMaterials=()=>{setSourceKeyword('');setMaterialOpen(true);void queryMaterials(0,'')}
 const closeMaterials=()=>{setMaterialOpen(false);requestAnimationFrame(()=>inputRef.current?.focus())}
 const submit=(input:Parameters<typeof aiApi.send>[0],queued=false)=>run(async()=>{
  let accepted=false
  try{
   let sent!:Awaited<ReturnType<typeof aiApi.send>>
   await savedDiaryAction(async()=>{sent=await aiApi.send(input)});accepted=true
   if(queued)setQueue(old=>old.filter(item=>item.input.requestId!==input.requestId))
   else{sendRequest.current=null;setText('');drafts.current.delete(draftKey())}
   setLocation(null)
   if(contextDiary.current)diaryChats.current.set(contextDiary.current,sent.recordId)
   drafts.current.set(sent.recordId,{text:queued?text:'',sources:[...sources],profileId,selection})
   if(!id)setId(sent.recordId)
   current.current=sent.recordId
   setWorkspace(old=>old?.id===sent.recordId?{...old,task:sent}:null)
   const w=await aiApi.workspace(sent.recordId);setWorkspace(w)
   if(!queued){const used=w.effectiveModel?{model:w.effectiveModel,reasoningEffort:w.effectiveEffort??null}:selection;setSelection(used);drafts.current.set(sent.recordId,{text:'',sources:[...sources],profileId,selection:used})}
   void refreshChats()
  }catch(e){if(queued&&!accepted)setQueue(old=>old.map(item=>item.input.requestId===input.requestId?{...item,error:errorMessage(e)}:item));else throw e}
 })
 const send=()=>{
  if(busyRef.current||previewRequest.current||!profile||!text.trim())return
  const input:Parameters<typeof aiApi.send>[0]={...(selection?{selection:{...selection}}:{}),requestId:crypto.randomUUID(),conversationId:id,profileId:profile.id,text,sourceIds:[...sources],recordDate:localDate(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}
  if(id&&(running||pending.length)){setQueue(old=>[...old,{recordId:id,input}]);setText('');sendRequest.current=null;return}
  sendRequest.current??=input.requestId;input.requestId=sendRequest.current
  return submit(input)
 }
 useEffect(()=>{
  if(!active||preview||busy||busyRef.current||running||!head||queueBlocked||!id||workspace?.id!==id||task?.status==='save_failed')return
  void submit(head.input,true)
 },[active,preview,busy,running,head,queueBlocked,id,workspace?.id,task?.status])
 const continueQueue=()=>setQueue(old=>old.map(item=>item.recordId===id?{...item,paused:false,error:undefined,continueAfterFailure:item.input.requestId===head?.input.requestId}:item))
 const stop=()=>{setQueue(old=>old.map(item=>item.recordId===id?{...item,paused:true}:item));void run(async()=>{await aiApi.cancel(task!.id);await refresh()})}

 const generate=(choice:PreviewMode)=>run(async()=>{if(!id||!profile)return;if(pending.length)throw new Error('请先处理待发送消息');const targetId=choice==='create'?null:target;if(choice!=='create'&&!targetId)throw new Error('请先选择要补充的日记');let result!:Awaited<ReturnType<typeof aiApi.generatePreview>>;await savedDiaryAction(async()=>{result=await aiApi.generatePreview({...(selection?{selection}:{}),requestId:crypto.randomUUID(),recordId:id!,profileId:profile.id,mode:choice,targetId,sourceIds:sources})});setPreview(null);setPreviewDirty(false);previewRequest.current=result.id;await refresh()})
 const adopt=()=>run(async()=>{if(!preview)return;adoptRequest.current??=crypto.randomUUID();let result!:Awaited<ReturnType<typeof aiApi.adopt>>;await savedDiaryAction(async()=>{result=await aiApi.adopt({taskId:preview.taskId,requestId:adoptRequest.current!,title:previewTitle,recordDate:previewDate,text:previewText})});setPreview(await aiApi.preview(preview.taskId));setPreviewDirty(false);setTarget(result.recordId);setNotice('日记已保存。聊天仍独立保留。');await refresh();void refreshChats()})
 const importFiles=(files:File[])=>run(async()=>{if(!id)throw new Error('先发送一条讲述，再添加本地图片');const failures:string[]=[];for(const file of files){try{await aiApi.importImage(id,file)}catch(e){failures.push(`${file.name}：${errorMessage(e)}`)}}await refresh();if(failures.length)throw new Error(failures.join('\n'))})
 const sourceTitle=(source:string)=>targetRecord?.id===source?targetRecord.title||'无标题日记':items.find(i=>i.id===source)?.title||workspace?.sources.find(s=>s.id===source)?.title||'已选日记'
 const canMakeDiary=!!id&&!!workspace?.messages.some(message=>message.role==='user'&&message.text.trim())
 const pageActions:PageAction[]=id&&!preview?[
  ...(canMakeDiary?[{id:'save-diary',label:'保存为日记',icon:BookOpenIcon,primary:true,disabled:busy||running||pending.length>0||!profile,onSelect:()=>void generate('create')},
   {id:'choose-target',label:'选择目标日记',icon:BookOpenIcon,disabled:busy||running,onSelect:()=>{setTargetOpen(true);void queryMaterials(0,'')}}]:[]),
  ...(canMakeDiary&&target?[{id:'append-diary',label:'补充到关联日记',icon:BookOpenIcon,disabled:busy||running||pending.length>0||!profile,onSelect:()=>void generate('append')},{id:'rewrite-diary',label:'重新整理全文…',icon:PencilIcon,disabled:busy||running||pending.length>0||!profile,onSelect:()=>void generate('rewrite')}]:[]),
  {id:'rename-chat',label:'重命名',icon:PencilIcon,disabled:busy,onSelect:()=>setRename(workspace?.title||'')},
  {id:'delete-chat',label:'删除聊天',icon:Trash2Icon,destructive:true,disabled:busy,onSelect:()=>void run(async()=>setDeleteImpact(await libraryApi.trashImpact(id)))},
 ]:[]
 return <div className="flex h-full min-h-0">{active&&<PageActions target={onClose?localActions:titlebarTarget} actions={pageActions}/>}

  <aside id="chat-sidebar" aria-label="聊天历史" hidden={!sidebarOpen} className="workspace-sidebar gap-3 p-3"><div className="flex items-center justify-between gap-2"><h1 className="font-semibold">聊天</h1><Button size="sm" variant="outline" disabled={busy} onClick={()=>switchChat(null)}><PenLineIcon data-icon="inline-start" aria-hidden="true"/>新对话</Button></div><div className="min-h-0 flex-1 overflow-y-auto">{loading&&!chats.length&&<p className="p-2 text-xs text-muted-foreground">正在读取…</p>}{!loading&&!chats.length&&<p className="p-2 text-sm text-muted-foreground">暂无聊天</p>}{chats.map(chat=><Button key={chat.id} variant={id===chat.id?'secondary':'ghost'} aria-current={id===chat.id?'true':undefined} className="mb-1 h-auto w-full justify-start whitespace-normal py-3 text-left" disabled={busy} onClick={()=>switchChat(chat.id)}>{chat.title||'新的对话'}</Button>)}{next!==null&&<Button variant="ghost" disabled={loading} onClick={()=>void refreshChats(next)}>更多聊天</Button>}</div></aside>
  <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="聊天工作区"><header className="workspace-toolbar gap-2"><div className="min-w-0"><h2 className="truncate text-sm font-medium">{workspace?.title||'新对话'}</h2></div><div ref={setLocalActions} className="flex gap-1">{!sidebarOpen&&!onClose&&<Button variant="ghost" size="icon-sm" aria-label="新对话" title="新对话" disabled={busy} onClick={()=>switchChat(null)}><PenLineIcon aria-hidden="true"/></Button>}{onClose&&<Button variant="ghost" size="icon-sm" aria-label="关闭侧边聊天" disabled={busy} onClick={onClose}><XIcon aria-hidden="true"/></Button>}</div></header>
   {error&&<div role="alert" className="shrink-0 px-5 py-3 text-sm text-destructive">{error}<Button variant="ghost" size="sm" onClick={()=>void run(async()=>{await refresh();await refreshChats()})}>核对状态</Button></div>}{notice&&<p role="status" className="px-5 py-2 text-sm">{notice}</p>}
   {rename!==null&&<form className="flex gap-2 border-b p-3" onSubmit={e=>{e.preventDefault();void run(async()=>{await aiApi.rename(id!,rename);setRename(null);await refresh();await refreshChats()})}}><Input aria-label="聊天名称" value={rename} onChange={e=>setRename(e.target.value)}/><Button disabled={busy}>保存名称</Button><Button type="button" variant="ghost" onClick={()=>setRename(null)}>取消</Button></form>}
   {preview?<div className="min-h-0 flex-1 overflow-y-auto"><section className="mx-auto flex max-w-4xl flex-col gap-5 p-6" aria-label="日记预览"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{preview.mode==='append'?'补充到日记':preview.mode==='rewrite'?'重新整理全文':'创建日记'} · 预览</h3><Button variant="ghost" onClick={()=>{if(id)previewCache.current.set(id,{value:preview,text:previewText,title:previewTitle,date:previewDate,dirty:previewDirty});setPreview(null);setPreviewDirty(false)}}>返回聊天</Button></div>{preview.adoptedId&&<p role="status" className="text-sm">已保存到日记</p>}{!preview.adoptedId&&preview.mode==='rewrite'&&<p className="text-sm text-muted-foreground">采用后替换日记正文。</p>}{preview.mode!=='create'&&<details><summary className="cursor-pointer text-sm">查看修改前的日记</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{preview.targetText||'原文不可用'}</p></details>}<FieldGroup><Field><FieldLabel htmlFor="preview-title">标题</FieldLabel><Input id="preview-title" aria-label="日记预览标题" disabled={Boolean(preview.adoptedId)} value={previewTitle} onChange={e=>{setPreviewTitle(e.target.value);setPreviewDirty(true);adoptRequest.current=null}}/></Field><Field><FieldLabel htmlFor="preview-date">日记日期</FieldLabel><Input id="preview-date" aria-label="日记预览日期" type="date" disabled={Boolean(preview.adoptedId)||preview.mode!=='create'} value={previewDate} onChange={e=>{setPreviewDate(e.target.value);setPreviewDirty(true);adoptRequest.current=null}}/></Field><Field><FieldLabel htmlFor="preview-text">{preview.mode==='append'?'新增段落':'日记正文'}</FieldLabel><Textarea id="preview-text" aria-label="日记预览正文" className="min-h-64" disabled={Boolean(preview.adoptedId)} value={previewText} onChange={e=>{setPreviewText(e.target.value);setPreviewDirty(true);adoptRequest.current=null}}/></Field></FieldGroup><div className="flex flex-wrap gap-2">{preview.adoptedId?<><Button onClick={()=>onOpenDiary(preview.adoptedId!)}>打开日记</Button>{preview.canUndo&&<Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{let result!:Awaited<ReturnType<typeof aiApi.undoAdoption>>;await savedDiaryAction(async()=>{result=await aiApi.undoAdoption(preview.taskId)});updatePreview(await aiApi.preview(preview.taskId));setNotice('本次修改已撤销，日记恢复到采用前内容。');setTarget(result.recordId)})}>撤销本次修改</Button>}</>:<><Button disabled={busy||!previewText.trim()} onClick={()=>void adopt()}>{preview.mode==='create'?'创建日记':preview.mode==='append'?'加入日记':'采用修改'}</Button><Button variant="outline" disabled={busy||running||pending.length>0||!profile} onClick={()=>void generate(preview.mode)}>重新生成</Button></>}</div></section></div>:<>
    <div className="min-h-0 flex-1"><MessageScrollerProvider autoScroll={!location||location.follow}><MessageScroller><SearchLocation location={location} workspace={workspace} onLocated={()=>setLocation(old=>old?{...old,located:true}:null)} onMissing={()=>{setLocation(null);setError('命中的消息已不存在，请重新搜索。')}}/><MessageScrollerViewport onScroll={event=>{const node=event.currentTarget;if(location?.located&&!location.follow&&node.scrollHeight-node.clientHeight-node.scrollTop<=8)setLocation({...location,follow:true})}}><MessageScrollerContent className="mx-auto max-w-4xl p-6" aria-label="聊天消息">{workspace?.messages.map(message=><MessageScrollerItem key={message.id} tabIndex={-1} messageId={message.id} scrollAnchor={message.role==='user'}><Message align={message.role==='user'?'end':'start'}><MessageContent><MessageHeader className="sr-only">{message.role==='user'?'你':'AI'}</MessageHeader><ReasoningSummary text={message.reasoningSummary}/><Bubble align={message.role==='user'?'end':'start'} variant={message.role==='user'?'muted':'ghost'}><BubbleContent className="whitespace-pre-wrap leading-7">{location?.messageId===message.id?<SearchHighlight text={message.text} keyword={location.keyword}/>:message.text}{Boolean(message.images?.length)&&id&&<AttachmentSurface scope={{recordId:id,revisionId:null,imageIds:message.images}}><div className="mt-3 flex flex-wrap gap-3">{message.images?.map(image=><AttachmentImage key={image} attachmentId={image} className="max-h-64 max-w-full rounded object-contain"/>)}</div></AttachmentSurface>}</BubbleContent></Bubble>{message.role==='assistant'&&<MessageDetails text={message.text} createdAt={message.createdAt} durationMs={message.durationMs}/>}</MessageContent></Message></MessageScrollerItem>)}{task&&task.status!=='completed'&&<MessageScrollerItem messageId={`task:${task.id}`}><Message><MessageContent><MessageHeader>{running?'正在生成…':({failed:'生成失败',cancelled:'已取消',interrupted:'上次生成已中断',save_failed:'结果尚未保存'} as Record<string,string>)[task.status]}</MessageHeader><MessageDetails startedAt={task.startedAt} running={running} durationMs={task.startedAt!==undefined&&task.updatedAt!==undefined?task.updatedAt-task.startedAt:undefined}/><ReasoningSummary text={task.reasoningSummary} running={running}/><p className="whitespace-pre-wrap text-sm leading-7">{task.partial}</p>{task.error&&<p className="text-sm text-destructive">{task.error}</p>}{task.status==='save_failed'&&<Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{await aiApi.retrySave(task.id);await refresh()})}>重试保存结果</Button>}</MessageContent></Message></MessageScrollerItem>}</MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton aria-label="回到最新消息" onClick={()=>setLocation(null)}/></MessageScroller></MessageScrollerProvider></div>
    <div className="mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-3 px-5 pb-5">

     {pending.length>0&&<section aria-label="待发送消息" className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border/60 p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">待发送 · {pending.length}</span>{queueBlocked&&!editingQueue&&task?.status!=='save_failed'&&<Button type="button" size="xs" variant="ghost" disabled={busy||running} onClick={continueQueue}>继续发送</Button>}</div>
      {pending.map(item=><div key={item.input.requestId} className="flex items-start gap-2">
       <div className="min-w-0 flex-1">{item.editingText!==undefined?<div className="flex flex-col gap-2">
        <Textarea autoFocus aria-label={`修改待发送消息：${item.input.text}`} className="min-h-20 max-h-40" value={item.editingText} disabled={busy} onChange={e=>setQueue(old=>old.map(value=>value.input.requestId===item.input.requestId?{...value,editingText:e.target.value}:value))} onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing){e.stopPropagation();setQueue(old=>old.map(value=>value.input.requestId===item.input.requestId?{...value,editingText:undefined}:value))}}}/>
        <div className="flex gap-1"><Button type="button" size="xs" disabled={busy||!item.editingText.trim()} onClick={()=>setQueue(old=>old.map(value=>value.input.requestId===item.input.requestId?{...value,input:{...value.input,text:value.editingText!},editingText:undefined}:value))}>保存修改</Button><Button type="button" variant="ghost" size="xs" disabled={busy} onClick={()=>setQueue(old=>old.map(value=>value.input.requestId===item.input.requestId?{...value,editingText:undefined}:value))}>取消修改</Button></div>
       </div>:<p className="truncate text-sm">{item.input.text}</p>}{item.error&&<p role="alert" className="text-xs text-destructive">{item.error}</p>}</div>
       {item.editingText===undefined&&<Button type="button" variant="ghost" size="icon-xs" aria-label={`修改待发送消息：${item.input.text}`} disabled={busy} onClick={()=>{if(!busyRef.current)setQueue(old=>old.map(value=>value.input.requestId===item.input.requestId?{...value,editingText:value.input.text}:value))}}><PencilIcon/></Button>}
       <Button type="button" variant="ghost" size="icon-xs" aria-label={`移除待发送消息：${item.input.text}`} disabled={busy} onClick={()=>setQueue(old=>old.filter(value=>value.input.requestId!==item.input.requestId))}><XIcon/></Button>
      </div>)}
     </section>}
     {sources.length>0&&<div className="flex flex-wrap gap-2">{sources.map(source=><Button key={source} size="sm" variant="secondary" className="h-auto max-w-full whitespace-normal" disabled={busy||running} onClick={()=>setSources(old=>old.filter(s=>s!==source))}>日记：{sourceTitle(source)} ×</Button>)}</div>}
     {materialOpen&&<section className="flex max-h-52 flex-col gap-2 overflow-y-auto rounded border p-3" aria-label="附加日记" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeMaterials()}}}><div className="flex items-center justify-between"><h3 className="text-sm font-medium">选择日记</h3><Button type="button" variant="ghost" size="icon-sm" aria-label="关闭日记选择器" onClick={closeMaterials}><XIcon aria-hidden="true"/></Button></div><form className="flex gap-2" onSubmit={e=>{e.preventDefault();void queryMaterials()}}><Input ref={sourceInput} aria-label="查找上下文日记" placeholder="搜索日记" value={sourceKeyword} onChange={e=>setSourceKeyword(e.target.value)}/><Button variant="outline" size="sm">查找</Button></form>{items.map(item=><label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sources.includes(item.id)} disabled={busy||running} onChange={e=>setSources(old=>e.target.checked?[...old,item.id]:old.filter(s=>s!==item.id))}/>{item.title||'无标题日记'}</label>)}{sourceNext!==null&&<Button size="sm" variant="ghost" onClick={()=>void queryMaterials(sourceNext)}>更多日记</Button>}</section>}
     {!profile&&<p className="text-sm text-muted-foreground">{profiles.some(p=>!p.label.startsWith('[已停用]'))?'请选择 AI 服务':'未配置 AI 服务'}<Button variant="link" size="sm" onClick={onSettings}>前往设置</Button></p>}
     <form onSubmit={e=>{e.preventDefault();void send()}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy&&!running)void importFiles(Array.from(e.dataTransfer.files))}}><InputGroup className="rounded-3xl border-input/80 bg-background shadow-sm has-[[data-slot=input-group-control]:focus-visible]:border-input/80 has-[[data-slot=input-group-control]:focus-visible]:ring-0"><InputGroupTextarea className="min-h-20 max-h-56 overflow-y-auto px-4 pt-4 pb-2" ref={inputRef} aria-label="聊天输入" placeholder="输入消息…" value={text} disabled={busy} onChange={e=>{setText(e.target.value);sendRequest.current=null}} onKeyDown={e=>{if(e.key==='@'&&!e.nativeEvent.isComposing&&!e.metaKey&&!e.ctrlKey){e.preventDefault();openMaterials();return}if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();if(profile&&text.trim()&&!busy)void send()}}} onPaste={e=>{const images=Array.from(e.clipboardData.files).filter(f=>f.type.startsWith('image/'));if(images.length&&!busy&&!running){e.preventDefault();void importFiles(images)}}}/><InputGroupAddon align="block-end" className="flex-wrap gap-1 px-3 pt-0 pb-3"><DropdownMenu><DropdownMenuTrigger asChild><InputGroupButton type="button" variant="ghost" size="icon-sm" aria-label="添加附件" title="添加附件" className="rounded-full" disabled={busy||running}><PlusIcon/></InputGroupButton></DropdownMenuTrigger><DropdownMenuContent align="start" side="top" sideOffset={4}><DropdownMenuItem disabled={!id} onSelect={()=>fileInput.current?.click()}><ImagePlusIcon aria-hidden="true"/>添加图片</DropdownMenuItem><DropdownMenuItem onSelect={openMaterials}><BookOpenIcon aria-hidden="true"/>附加日记</DropdownMenuItem></DropdownMenuContent></DropdownMenu><ChatModelControls active={active} profiles={profiles} profileId={profileId} selection={selection} disabled={busy||running} onProfile={value=>{setProfileId(value);setSelection(undefined);sendRequest.current=null}} onSelection={value=>{setSelection(value);sendRequest.current=null}}/>{running&&<InputGroupButton type="button" aria-label="停止生成" title="停止生成" className="shrink-0 rounded-full" size="icon-sm" variant="secondary" disabled={busy} onClick={stop}><SquareIcon/></InputGroupButton>}<InputGroupButton type="submit" aria-label="发送消息" title="发送消息" variant="default" className="shrink-0 rounded-full" size="icon-sm" disabled={busy||Boolean(previewRequest.current)||!profile||!text.trim()}><ArrowUpIcon/></InputGroupButton></InputGroupAddon></InputGroup><input ref={fileInput} type="file" className="hidden" multiple accept="image/png,image/jpeg,image/webp" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void importFiles(files)}}/></form>

     {Boolean(workspace?.sources.length)&&<details><summary className="cursor-pointer text-xs text-muted-foreground">来源与关联</summary><div className="flex flex-col gap-2 pt-3">{workspace?.sources.map(source=><div key={`${source.id}:${source.revisionId}`} className="flex flex-wrap items-center gap-1 text-xs">{source.unavailable?'来源已删除':source.title||'无标题日记'}{!source.unavailable&&<><Button size="xs" variant="ghost" onClick={()=>void run(async()=>setCompare(await aiApi.compare(id!,source.id,source.revisionId!)))}>查看当时版本</Button><Button size="xs" variant="ghost" onClick={()=>onOpenDiary(source.id)}>打开日记</Button></>}</div>)}</div>{compare!==null&&<section className="mt-3 max-h-48 overflow-y-auto"><Button size="xs" variant="ghost" onClick={()=>setCompare(null)}>收起来源</Button><p className="whitespace-pre-wrap text-xs leading-6">{compare}</p></section>}</details>}
    </div>
   </>}
  </section>
  <Dialog open={active&&targetOpen} onOpenChange={setTargetOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>选择目标日记</DialogTitle></DialogHeader><NativeSelect className="w-full" aria-label="补充目标日记" value={target??''} onChange={e=>{setTarget(e.target.value||null);setTargetRecord(null)}}><NativeSelectOption value="">选择日记</NativeSelectOption>{target&&!items.some(item=>item.id===target)&&<NativeSelectOption value={target}>{sourceTitle(target)}</NativeSelectOption>}{items.map(item=><NativeSelectOption key={item.id} value={item.id}>{item.title||'无标题日记'}</NativeSelectOption>)}</NativeSelect>{sourceNext!==null&&<Button variant="ghost" onClick={()=>void queryMaterials(sourceNext,'')}>更多日记</Button>}<DialogFooter><Button onClick={()=>setTargetOpen(false)}>完成</Button></DialogFooter></DialogContent></Dialog>
  {deleteImpact&&<DeleteRecordDialog impact={deleteImpact} onClose={()=>setDeleteImpact(null)} onDeleted={()=>{setDeleteImpact(null);for(const [diary,chat] of diaryChats.current){if(chat===id)diaryChats.current.delete(diary)}setQueue(old=>old.filter(item=>item.recordId!==id));drafts.current.delete(id!);previewCache.current.delete(id!);setSelection(undefined);setId(null);setWorkspace(null);setText('');setSources(contextDiary.current?[contextDiary.current]:[]);setPreview(null);setPreviewDirty(false);setTarget(contextDiary.current);void refreshChats()}}/>}
 </div>
}

function SearchLocation({location,workspace,onMissing,onLocated}:{location:MessageLocation|null;workspace:AiWorkspace|null;onMissing:()=>void;onLocated:()=>void}) {
 const {scrollToMessage}=useMessageScroller(),applied=useRef<number|null>(null)
 useEffect(()=>{
  if(!location||!workspace||applied.current===location.nonce)return
  if(!workspace.messages.some(message=>message.id===location.messageId)){applied.current=location.nonce;onMissing();return}
  const frame=requestAnimationFrame(()=>{if(scrollToMessage(location.messageId,{align:'center',behavior:'instant'})){applied.current=location.nonce;onLocated();[...document.querySelectorAll<HTMLElement>('[data-message-id]')].find(node=>node.dataset.messageId===location.messageId)?.focus({preventScroll:true})}})
  return()=>cancelAnimationFrame(frame)
 },[location,workspace,scrollToMessage,onMissing,onLocated])
 return null
}

function taskStatusBlocked(status:string|undefined){return Boolean(status&&status!=='completed'&&status!=='running')}
