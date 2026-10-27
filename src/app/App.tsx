import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { listen } from '@tauri-apps/api/event'
import { BookOpenIcon, MessageCircleIcon, SettingsIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, FeatherIcon, PaletteIcon, SlidersHorizontalIcon, ArrowLeftIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LibraryWorkspace, type LibraryHandle } from '@/features/library/LibraryWorkspace'
import { ChatWorkspace, type ChatIntent } from '@/features/chat/ChatWorkspace'
import { AiSettings } from '@/features/library/AiSettings'
import { aiApi, type AiProfile, type AiPreferences } from '@/features/library/aiApi'
import { errorMessage } from '@/features/library/api'
import { desktopAvailable, readRuntimeInfo } from '@/shared/runtime'
import { AppearanceSettings } from '@/features/settings/AppearanceSettings'
import { useAppearance } from './useAppearance'
import { useChatDockWidth } from './useChatDockWidth'
import { GlobalCommand, type SearchAction } from '@/features/search/GlobalCommand'
import { TrashPanel } from '@/features/library/TrashPanel'
import './app.css'
type Page='diary'|'chat'|'settings'
export default function App(){
 const [page,setPage]=useState<Page>('diary'),[profiles,setProfiles]=useState<AiProfile[]>([]),[preferences,setPreferences]=useState<AiPreferences>({defaultProfileId:null}),[intent,setIntent]=useState<ChatIntent|null>(null),[settingsDirty,setSettingsDirty]=useState(false),[chatDirty,setChatDirty]=useState(false),[settingsBusy,setSettingsBusy]=useState(false),[chatBusy,setChatBusy]=useState(false),[trashBusy,setTrashBusy]=useState(false),[trashDomain,setTrashDomain]=useState<'diary'|'chat'>('diary'),[exitOpen,setExitOpen]=useState(false),[error,setError]=useState('')
 const [sidebarOpen,setSidebarOpen]=useState(true),[settingsTab,setSettingsTab]=useState<'appearance'|'models'|'trash'>('appearance')
 const [diaryId,setDiaryId]=useState<string|null>(null),[chatDiary,setChatDiary]=useState<string|null>(null),[chatDockOpen,setChatDockOpen]=useState(false)
 const docked=page==='diary'&&Boolean(diaryId)&&chatDiary===diaryId&&chatDockOpen
 const chatWidth=useChatDockWidth(docked)
 const [macTitlebar,setMacTitlebar]=useState(false)
 const [titlebarTarget,setTitlebarTarget]=useState<HTMLDivElement|null>(null)
 const appearance=useAppearance()
 const settingsReturn=useRef<Page>('diary')
 const library=useRef<LibraryHandle>(null),exitDialog=useRef<HTMLDialogElement>(null),exitAction=useRef(()=>{})
 const refresh=useCallback(async()=>{if(!desktopAvailable)return;try{const [p,preferred]=await Promise.all([aiApi.profiles(),aiApi.preferences()]);setProfiles(p);setPreferences(preferred);setError('')}catch(e){setError(errorMessage(e))}},[])
 useEffect(()=>{void refresh()},[refresh])
 useEffect(()=>{
  if(!desktopAvailable)return
  let disposed=false
  void readRuntimeInfo().then(info=>{
   if(disposed)return
   setMacTitlebar(info.platform==='macos')
   document.documentElement.classList.toggle('native-material',info.platform==='macos'||info.platform==='windows')
  }).catch(e=>{if(!disposed)setError(errorMessage(e))})
  return()=>{disposed=true;document.documentElement.classList.remove('native-material')}
 },[])
 const exit=()=>{setExitOpen(false);setPage('diary');library.current?.exit()}
 exitAction.current=()=>{if(settingsBusy||trashBusy||chatBusy){setError('正在完成当前操作，请稍后退出。');return}if(settingsDirty||chatDirty)setExitOpen(true);else exit()}
 useEffect(()=>{if(!desktopAvailable)return;let disposed=false;const subscription=listen('exit-requested',()=>exitAction.current());void subscription.then(unlisten=>{if(disposed)unlisten()});return()=>{disposed=true;void subscription.then(unlisten=>unlisten())}},[])
 useEffect(()=>{if(exitOpen)exitDialog.current?.showModal()},[exitOpen])
 const navigate=(next:Page)=>{if(settingsBusy||trashBusy||chatBusy)return;if(next==='diary'){library.current?.home();return}if(next===page)return;if(next==='settings')settingsReturn.current=page;if(page==='diary')library.current?.navigate(next);else setPage(next)}
 const openDiary=(id:string)=>{setPage('diary');library.current?.openDiary(id,'chat')}
 const command=(action:SearchAction)=>{
  if(settingsBusy||trashBusy||chatBusy)return
  if(action.kind==='diary'||action.kind==='create'){if(page!=='diary')setPage('diary');if(action.kind==='diary')library.current?.openDiary(action.id);else library.current?.create();return}
  library.current?.run(()=>{if(action.kind==='settings'){if(page!=='settings')settingsReturn.current=page;setPage('settings');requestAnimationFrame(()=>{const heading=[...document.querySelectorAll<HTMLElement>('[aria-label="设置页面"] h1')].find(node=>!node.closest('[hidden]'));if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}})}else{setIntent({chatId:action.id,messageId:action.messageId,keyword:action.keyword,nonce:Date.now()});setPage('chat')}})
 }
 const startDiaryChat=(id:string)=>{if(chatBusy)return;setIntent({diaryId:id,nonce:Date.now()});setChatDiary(id);setChatDockOpen(true)}
 return <main className="studio-shell">
  <header aria-label="窗口标题栏" className={`studio-titlebar${macTitlebar?' studio-titlebar-macos':''}`} data-tauri-drag-region>
   {page!=='diary'&&<Button size="icon-sm" variant="ghost" className="aria-expanded:bg-transparent aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50" aria-label={sidebarOpen?'收起侧栏':'展开侧栏'} title={sidebarOpen?'收起侧栏':'展开侧栏'} aria-expanded={sidebarOpen} aria-controls={`${page}-sidebar`} onClick={()=>setSidebarOpen(value=>!value)}>{sidebarOpen?<PanelLeftCloseIcon aria-hidden="true"/>:<PanelLeftOpenIcon aria-hidden="true"/>}</Button>}
   <span className="text-xs font-medium" data-tauri-drag-region>LifeStory Studio</span><div ref={setTitlebarTarget} role="toolbar" aria-label="当前页面操作" className="ml-auto flex shrink-0 items-center gap-1" style={{WebkitAppRegion:'no-drag'} as CSSProperties}/>
  </header>
  <div className="studio-body">
  <nav aria-label="软件导航" className="studio-rail" data-tooltip-orientation="vertical">
   <div className="studio-mark" title="LifeStory Studio"><FeatherIcon aria-hidden="true"/><span className="sr-only">LifeStory Studio</span></div>
   {([{id:'diary',label:'日记',icon:BookOpenIcon},{id:'chat',label:'聊天',icon:MessageCircleIcon}] as const).map(item=><Button key={item.id} variant="navigation" size="icon" className="size-10" aria-label={item.label} title={item.label} aria-current={page===item.id?'page':undefined} disabled={settingsBusy||trashBusy||chatBusy} onClick={()=>navigate(item.id)}><item.icon aria-hidden="true"/></Button>)}
   <GlobalCommand disabled={settingsBusy||trashBusy||chatBusy} onAction={command}/>
   <div className="mt-auto"/><Button variant="navigation" size="icon" className="size-10" aria-label="设置" title="设置" aria-current={page==='settings'?'page':undefined} disabled={settingsBusy||trashBusy||chatBusy} onClick={()=>navigate('settings')}><SettingsIcon aria-hidden="true"/></Button>
  </nav>
  <div className="studio-frame">
   {error&&<div role="alert" className="flex shrink-0 items-center justify-between border-b px-4 py-2 text-sm text-destructive">{error}<Button size="sm" variant="ghost" onClick={()=>void refresh()}>重新读取</Button></div>}
   <div ref={chatWidth.container} hidden={page==='settings'} className="flex min-h-0 min-w-0 flex-1">
   <section aria-label="日记页面" className="min-h-0 min-w-0 flex-1" style={{display:page==='diary'?'block':'none'}}><LibraryWorkspace ref={library} titlebarTarget={titlebarTarget} active={page==='diary'} managedExit onNavigate={setPage} onChat={startDiaryChat} onRecordChange={setDiaryId}/></section>
   <section id="diary-chat-panel" aria-label={docked?'日记侧边聊天':'聊天页面'} className={docked?'relative min-h-0 min-w-0 shrink-0 border-l':'min-h-0 min-w-0 flex-1'} style={{display:page==='chat'||docked?'block':'none',width:docked?chatWidth.width:undefined}}>{docked&&<div role="separator" tabIndex={0} aria-label="调整聊天面板宽度" aria-orientation="vertical" aria-controls="diary-chat-panel" aria-valuemin={chatWidth.min} aria-valuemax={chatWidth.max} aria-valuenow={chatWidth.width} aria-valuetext={`${chatWidth.width} 像素`} data-dragging={chatWidth.dragging||undefined} className="absolute -left-1 top-0 z-10 h-full w-2 touch-none cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-ring focus-visible:after:bg-ring focus-visible:ring-2 focus-visible:ring-ring data-[dragging]:after:bg-ring" {...chatWidth.handle}/>}{docked&&chatWidth.error&&<p role="alert" className="absolute inset-x-2 top-12 z-10 rounded border bg-card p-2 text-xs text-destructive">{chatWidth.error}</p>}<ChatWorkspace titlebarTarget={page==='chat'?titlebarTarget:null} active={page==='chat'||docked} sidebarOpen={!docked&&sidebarOpen} onClose={docked?()=>{setChatDockOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[aria-label="聊聊这篇日记"]')?.focus())}:undefined} withSavedDiary={docked?async action=>{if(!library.current)throw new Error('日记编辑器尚未准备好');await library.current.withSavedDiary(action)}:undefined} profiles={profiles} preferences={preferences} intent={intent} onSettings={()=>{setSettingsTab('models');navigate('settings')}} onOpenDiary={openDiary} onDirty={setChatDirty} onBusy={setChatBusy}/></section>
   </div>
   <section aria-label="设置页面" className="h-full min-h-0 flex-1" style={{display:page==='settings'?'flex':'none'}}>
    <aside id="settings-sidebar" aria-label="设置分类" className="workspace-sidebar settings-sidebar" hidden={!sidebarOpen}><div className="sidebar-heading"><h1>设置</h1><Button size="icon-sm" variant="ghost" aria-label="返回主界面" title="返回主界面" onClick={()=>navigate(settingsReturn.current)} disabled={settingsBusy||trashBusy}><ArrowLeftIcon aria-hidden="true"/></Button></div><p className="sidebar-section-label">偏好设置</p>{([{id:'appearance',label:'外观',icon:PaletteIcon},{id:'models',label:'模型与提供商',icon:SlidersHorizontalIcon},{id:'trash',label:'回收站',icon:Trash2Icon}] as const).map(item=><Button key={item.id} variant={settingsTab===item.id?'secondary':'ghost'} className="w-full justify-start" aria-current={settingsTab===item.id?'page':undefined} disabled={settingsBusy||trashBusy} onClick={()=>setSettingsTab(item.id)}><item.icon data-icon="inline-start" aria-hidden="true"/>{item.label}</Button>)}</aside>
    <div className="min-w-0 flex-1 overflow-y-auto">{!sidebarOpen&&<div className="flex flex-wrap gap-2 px-5 pt-4"><Button size="sm" variant="ghost" disabled={settingsBusy||trashBusy} onClick={()=>navigate(settingsReturn.current)}><ArrowLeftIcon data-icon="inline-start"/>返回主界面</Button><Button size="sm" variant={settingsTab==='appearance'?'secondary':'ghost'} disabled={settingsBusy||trashBusy} onClick={()=>setSettingsTab('appearance')}>外观</Button><Button size="sm" variant={settingsTab==='models'?'secondary':'ghost'} disabled={settingsBusy||trashBusy} onClick={()=>setSettingsTab('models')}>模型与提供商</Button><Button size="sm" variant={settingsTab==='trash'?'secondary':'ghost'} disabled={settingsBusy||trashBusy} onClick={()=>setSettingsTab('trash')}>回收站</Button></div>}
     <div hidden={settingsTab!=='appearance'}><AppearanceSettings preference={appearance.preference} onChange={appearance.change} error={appearance.error}/></div>
     <div hidden={settingsTab!=='models'}><AiSettings active={page==='settings'} profiles={profiles} preferences={preferences} onChange={()=>void refresh()} onDirty={setSettingsDirty} onBusy={setSettingsBusy}/></div>
     {page==='settings'&&settingsTab==='trash'&&<section className="settings-content" aria-labelledby="trash-heading"><header className="settings-heading"><h1 id="trash-heading">回收站</h1></header><div className="mb-5 flex gap-2" role="group" aria-label="回收站分类">{(['diary','chat'] as const).map(domain=><Button key={domain} variant={trashDomain===domain?'secondary':'ghost'} aria-pressed={trashDomain===domain} disabled={trashBusy} onClick={()=>setTrashDomain(domain)}>{domain==='diary'?'日记':'聊天'}</Button>)}</div><TrashPanel key={trashDomain} domain={trashDomain} onBusy={setTrashBusy}/></section>}
    </div>
   </section>
  </div>
  </div>
  {exitOpen&&<dialog ref={exitDialog} aria-labelledby="exit-draft-title" onCancel={e=>{e.preventDefault();setExitOpen(false)}} className="m-auto max-w-md rounded-lg border bg-card p-6 text-foreground backdrop:bg-foreground/25"><h2 id="exit-draft-title" className="font-semibold">还有未发送或未保存的内容</h2><p className="my-4 text-sm leading-6">聊天输入、待发送消息、修改中的日记预览或服务配置尚未保存。返回页面后可以继续处理；退出将放弃这些输入，已经保存的聊天和日记保留。</p><div className="flex gap-2"><Button onClick={()=>setExitOpen(false)}>返回继续</Button><Button variant="outline" onClick={exit}>放弃这些输入并退出</Button></div></dialog>}
 </main>
}
