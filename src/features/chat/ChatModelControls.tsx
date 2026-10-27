import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, RefreshCwIcon } from 'lucide-react'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { aiApi, type AiProfile, type CliCatalog, type ModelSelection } from '@/features/library/aiApi'
import { errorMessage } from '@/features/library/api'

type Directory = { models: string[]; catalog?: CliCatalog; loading: boolean; error?: string }
export function ChatModelControls({active,profiles,profileId,selection,disabled,onProfile,onSelection}:{active:boolean;profiles:AiProfile[];profileId:string;selection:ModelSelection|undefined;disabled:boolean;onProfile:(id:string)=>void;onSelection:(value:ModelSelection)=>void}){
 const [open,setOpen]=useState(false),[directories,setDirectories]=useState<Record<string,Directory>>({})
 const generation=useRef(0)
 // Only connection changes reload directories; changing the selected model does not.
 const connections=JSON.stringify(profiles.filter(p=>!p.label.startsWith('[已停用]')))
 async function load(p:AiProfile,epoch:number){
  setDirectories(values=>({...values,[p.id]:{models:[],loading:true}}))
  try{
   const catalog=p.protocol==='codex'?await aiApi.codexCatalog(p.codexPath??''):undefined
   const models=catalog?catalog.models.map(item=>item.model):await aiApi.models(p.id)
   if(generation.current===epoch)setDirectories(values=>({...values,[p.id]:{models,catalog,loading:false}}))
  }catch(e){if(generation.current===epoch)setDirectories(values=>({...values,[p.id]:{models:[],loading:false,error:errorMessage(e)}}))}
 }
 useEffect(()=>{
  const epoch=++generation.current
  setDirectories({});setOpen(false)
  if(active)for(const p of JSON.parse(connections) as AiProfile[])void load(p,epoch)
  return()=>{generation.current++}
 },[active,connections])
 const available=profiles.filter(p=>!p.label.startsWith('[已停用]'))
 const profile=available.find(p=>p.id===profileId)
 const directory=profile?directories[profile.id]:undefined,catalog=directory?.catalog
 const defaultModel=profile?.cliModelMode==='inherit'?catalog?.currentModel:profile?.model
 const model=selection?.model??defaultModel
 const chosen=catalog?.models.find(item=>item.model===model)
 const modelDefaultEffort=model===catalog?.currentModel?catalog?.currentEffort:chosen?.defaultReasoningEffort
 const defaultEffort=selection?.model?modelDefaultEffort:profile?.reasoningEffort??modelDefaultEffort
 const effort=selection?.reasoningEffort??''
 return <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
  <Popover open={open&&active&&!disabled} onOpenChange={setOpen}>
   <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" role="combobox" aria-label="聊天模型" aria-expanded={open} disabled={disabled} className="max-w-72 min-w-0 text-muted-foreground"><span className="truncate">{profile?`${chosen?.displayName??model??'默认模型'} · ${profile.label}${profile.protocol==='codex'&&(effort||defaultEffort)?` · ${effort||defaultEffort}`:''}`:profileId?'原服务不可用，请重新选择':'选择模型'}</span><ChevronDownIcon data-icon="inline-end"/></Button></PopoverTrigger>
   <PopoverContent side="top" align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
    <Command><CommandInput aria-label="搜索模型" placeholder="搜索模型或来源…"/><CommandList><CommandEmpty>没有匹配的模型</CommandEmpty>
     {available.map(p=>{
      const source=directories[p.id],fallback=p.cliModelMode==='inherit'?source?.catalog?.currentModel:p.model
      const models=[...new Set([...(source?.models??[]),...(fallback?[fallback]:[]),...(p.id===profileId&&selection?.model?[selection.model]:[])])]
      return <CommandGroup key={p.id} heading={p.label}>{models.map(value=><CommandItem key={value} value={JSON.stringify([p.id,value])} keywords={[value,p.label,source?.catalog?.models.find(item=>item.model===value)?.displayName??'']} disabled={disabled} data-checked={p.id===profileId&&value===model} onSelect={()=>{onProfile(p.id);onSelection({model:value,reasoningEffort:source?.catalog?.models.find(item=>item.model===value)?.defaultReasoningEffort??null})}}><span className="min-w-0 truncate">{source?.catalog?.models.find(item=>item.model===value)?.displayName??value}</span><span className="truncate text-xs text-muted-foreground">{p.label}</span></CommandItem>)}</CommandGroup>
     })}
    </CommandList></Command>
    {available.some(p=>directories[p.id]?.loading)&&<p role="status" className="px-3 pb-2 text-xs text-muted-foreground">正在读取模型…</p>}
    {available.filter(p=>directories[p.id]?.error).map(p=><div key={p.id} className="flex items-center gap-1 px-3 pb-2"><p role="alert" className="min-w-0 text-xs text-destructive">{p.label}：{directories[p.id].error}</p><Button type="button" variant="ghost" size="icon-sm" aria-label={`重新读取 ${p.label} 模型`} disabled={disabled} onClick={()=>void load(p,generation.current)}><RefreshCwIcon/></Button></div>)}
    <Separator/>
    <div className="flex items-center gap-3 px-3 pb-3">{profile?.protocol==='codex'&&<><NativeSelect className="w-full" size="sm" aria-label="聊天推理强度" disabled={disabled||directory?.loading||!chosen?.supportedReasoningEfforts.length} value={effort} onChange={e=>onSelection({model:selection?.model??null,reasoningEffort:e.target.value||null})}><NativeSelectOption value="">默认强度{defaultEffort?` · ${defaultEffort}`:''}</NativeSelectOption>{effort&&!chosen?.supportedReasoningEfforts.some(item=>item.reasoningEffort===effort)&&<NativeSelectOption value={effort}>{effort}</NativeSelectOption>}{chosen?.supportedReasoningEfforts.map(item=><NativeSelectOption key={item.reasoningEffort} value={item.reasoningEffort}>{item.reasoningEffort}</NativeSelectOption>)}</NativeSelect></>}<Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={()=>setOpen(false)}>完成</Button></div>
   </PopoverContent>
  </Popover>

 </div>
}
