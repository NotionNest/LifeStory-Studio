import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { BookOpenIcon, MessageCircleIcon, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LibraryWorkspace, type LibraryHandle } from '@/features/library/LibraryWorkspace'
import { ChatWorkspace, type ChatIntent } from '@/features/chat/ChatWorkspace'
import { AiSettings } from '@/features/library/AiSettings'
import { aiApi, type AiProfile, type AiPreferences } from '@/features/library/aiApi'
import { errorMessage } from '@/features/library/api'
import { desktopAvailable } from '@/shared/runtime'
import './app.css'
type Page='diary'|'chat'|'settings'
export default function App(){
 const [page,setPage]=useState<Page>('diary'),[profiles,setProfiles]=useState<AiProfile[]>([]),[preferences,setPreferences]=useState<AiPreferences>({defaultProfileId:null}),[intent,setIntent]=useState<ChatIntent|null>(null),[settingsDirty,setSettingsDirty]=useState(false),[chatDirty,setChatDirty]=useState(false),[settingsBusy,setSettingsBusy]=useState(false),[chatBusy,setChatBusy]=useState(false),[exitOpen,setExitOpen]=useState(false),[error,setError]=useState('')
 const settingsReturn=useRef<Page>('diary')
 const library=useRef<LibraryHandle>(null),exitDialog=useRef<HTMLDialogElement>(null),exitAction=useRef(()=>{})
 const refresh=useCallback(async()=>{if(!desktopAvailable)return;try{const [p,preferred]=await Promise.all([aiApi.profiles(),aiApi.preferences()]);setProfiles(p);setPreferences(preferred);setError('')}catch(e){setError(errorMessage(e))}},[])
 useEffect(()=>{void refresh()},[refresh])
 const exit=()=>{setExitOpen(false);setPage('diary');library.current?.exit()}
 exitAction.current=()=>{if(settingsBusy||chatBusy){setError('正在完成当前操作，请稍后退出。');return}if(settingsDirty||chatDirty)setExitOpen(true);else exit()}
 useEffect(()=>{if(!desktopAvailable)return;let disposed=false;const subscription=listen('exit-requested',()=>exitAction.current());void subscription.then(unlisten=>{if(disposed)unlisten()});return()=>{disposed=true;void subscription.then(unlisten=>unlisten())}},[])
 useEffect(()=>{if(exitOpen)exitDialog.current?.showModal()},[exitOpen])
 const navigate=(next:Page)=>{if(next===page||settingsBusy||chatBusy)return;if(next==='settings')settingsReturn.current=page;if(page==='diary')library.current?.navigate(next);else setPage(next)}
 const openDiary=(id:string)=>{setPage('diary');library.current?.openDiary(id)}
 const startDiaryChat=(id:string)=>{setIntent({diaryId:id,nonce:Date.now()});setPage('chat')}
 return <main className="flex h-dvh min-h-0 bg-background text-foreground">
  <nav style={{display:page==='settings'?'none':undefined}} aria-label="软件导航" className="flex w-24 shrink-0 flex-col gap-2 border-r bg-card p-3 lg:w-36"><span className="mb-5 mt-2 text-center text-xs font-semibold tracking-tight">LifeStory<br/>Studio</span>{([{id:'diary',label:'日记',icon:BookOpenIcon},{id:'chat',label:'聊天',icon:MessageCircleIcon},{id:'settings',label:'设置',icon:SettingsIcon}] as const).map(item=><Button key={item.id} variant={page===item.id?'secondary':'ghost'} aria-current={page===item.id?'page':undefined} className="justify-start" disabled={settingsBusy||chatBusy} onClick={()=>navigate(item.id)}><item.icon data-icon="inline-start"/>{item.label}</Button>)}</nav>
  <div className="flex min-h-0 min-w-0 flex-1 flex-col">{error&&<div role="alert" className="flex shrink-0 items-center justify-between border-b px-4 py-2 text-sm text-destructive">{error}<Button size="sm" variant="ghost" onClick={()=>void refresh()}>重新读取</Button></div>}
   <section aria-label="日记页面" className="min-h-0 flex-1" style={{display:page==='diary'?'block':'none'}}><LibraryWorkspace ref={library} active={page==='diary'} managedExit onNavigate={setPage} onChat={startDiaryChat}/></section>
   <section aria-label="聊天页面" className="min-h-0 flex-1" style={{display:page==='chat'?'block':'none'}}><ChatWorkspace active={page==='chat'} profiles={profiles} preferences={preferences} intent={intent} onSettings={()=>navigate('settings')} onOpenDiary={openDiary} onDirty={setChatDirty} onBusy={setChatBusy}/></section>
   <section aria-label="设置页面" className="min-h-0 flex-1 overflow-y-auto" style={{display:page==='settings'?'block':'none'}}><header className="flex items-center gap-4 border-b px-6 py-4"><Button variant="ghost" onClick={()=>navigate(settingsReturn.current)} disabled={settingsBusy}>返回主界面</Button><h1 className="font-semibold">设置</h1></header><div className="flex min-h-full"><aside aria-label="设置分类" className="w-48 shrink-0 border-r p-4"><Button variant="secondary" className="w-full justify-start" aria-current="page">模型与提供商</Button></aside><AiSettings profiles={profiles} preferences={preferences} onChange={()=>void refresh()} onDirty={setSettingsDirty} onBusy={setSettingsBusy}/></div></section>
  </div>
  {exitOpen&&<dialog ref={exitDialog} aria-labelledby="exit-draft-title" onCancel={e=>{e.preventDefault();setExitOpen(false)}} className="m-auto max-w-md rounded-lg border bg-card p-6 text-foreground backdrop:bg-foreground/25"><h2 id="exit-draft-title" className="font-semibold">还有未发送或未保存的内容</h2><p className="my-4 text-sm leading-6">聊天输入、修改中的日记预览或服务配置尚未保存。返回页面后可以继续处理；退出将放弃这些输入，已经保存的聊天和日记保留。</p><div className="flex gap-2"><Button onClick={()=>setExitOpen(false)}>返回继续</Button><Button variant="outline" onClick={exit}>放弃这些输入并退出</Button></div></dialog>}
 </main>
}
