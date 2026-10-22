import { useEffect, useRef, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { aiApi, type AiPreferences, type AiProfile, type CliCatalog, type CliInstallation } from '@/features/library/aiApi'
import { errorMessage } from '@/features/library/api'

const emptyProfile = (path: string): AiProfile => ({id:'new',label:'Codex CLI',service:'codex',protocol:'codex',baseUrl:'',model:'',cliModelMode:'inherit',reasoningEffort:null,codexPath:path,contextChars:32000,maxOutputTokens:4096,downstream:null})
type Props = {profiles:AiProfile[];preferences?:AiPreferences;onChange:(profile?:AiProfile)=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}

export function LocalCliSettings({profiles,preferences,onChange,onDirty,onBusy}:Props) {
  const [installations,setInstallations] = useState<CliInstallation[]>([])
  const [scanned,setScanned] = useState(false)
  const [open,setOpen] = useState('')
  const [profile,setProfile] = useState<AiProfile>(emptyProfile(''))
  const [editing,setEditing] = useState<string|null>(null)
  const [dirty,setDirty] = useState(false)
  const [busy,setBusy] = useState(false)
  const [catalog,setCatalog] = useState<CliCatalog|null>(null)
  const [updated,setUpdated] = useState<number|null>(null)
  const [message,setMessage] = useState('')
  const [testing,setTesting] = useState<string|null>(null)
  const epoch = useRef(0)
  useEffect(()=>{onDirty(dirty)},[dirty,onDirty])
  useEffect(()=>{onBusy(busy)},[busy,onBusy])

  const active = profiles.filter(p=>p.protocol==='codex'&&!p.label.startsWith('[已停用]'))
  const saved = active.find(p=>p.id===editing)
  const current = installations.filter(i=>i.preferred!==false)
  const installation = current.find(i=>i.kind==='codex')
  const mode = profile.cliModelMode??'selected'
  const selected = catalog?.models.find(m=>m.model===(mode==='inherit'?catalog.currentModel:profile.model))
  const efforts = selected?.supportedReasoningEfforts??[]
  const selectedMissing = mode==='selected'&&!catalog?.models.some(m=>m.model===profile.model)
  const invalidEffort = !!profile.reasoningEffort&&!!catalog&&!efforts.some(e=>e.reasoningEffort===profile.reasoningEffort)
  const invalidModel = mode!=='inherit'&&!profile.model.trim()

  const run = async(action:()=>Promise<void>) => {
    setBusy(true);setMessage('')
    try { await action() } catch(e) { setMessage(errorMessage(e)) } finally { setBusy(false) }
  }
  const refreshCatalog = async(path:string) => {
    const request=++epoch.current
    setCatalog(null);setUpdated(null)
    const next=await aiApi.codexCatalog(path)
    if(request!==epoch.current)return
    setCatalog(next);setUpdated(Date.now())
    if(next.version)setInstallations(items=>items.map(i=>i.path===path?{...i,version:next.version!}:i))
  }
  const load = async(item:CliInstallation) => {
    const previous=active.find(p=>p.id===preferences?.defaultProfileId)??active[active.length-1]
    const next=previous?{...previous,label:'Codex CLI',codexPath:item.path,cliModelMode:previous.cliModelMode??'selected' as const}:emptyProfile(item.path)
    setProfile(next);setEditing(previous?.id??null)
    setDirty(!!previous&&(previous.codexPath!==item.path||previous.label!=='Codex CLI'))
    await refreshCatalog(item.path)
  }
  const field = (name:keyof AiProfile,value:string|number|null) => {
    setProfile(p=>({...p,[name]:value}));setDirty(true);setMessage('')
  }
  const scan = () => run(async()=>{
    const result=await aiApi.scanCli()
    setInstallations(result);setScanned(true);setOpen('');setCatalog(null);setUpdated(null);++epoch.current
    if(!result.length)setMessage('未找到当前可用的 CLI。已有配置和聊天保留，请检查终端中的安装后重新扫描。')
  })
  const test = () => run(async()=>{
    const requestId=crypto.randomUUID();setTesting(requestId)
    try {
      const result=await aiApi.testCli(profile,requestId)
      setMessage(`${result.modelReply?'连接测试通过':'模型测试未完成'}${result.model?` · ${result.model}`:''}。${result.detail}`)
    } finally { setTesting(null) }
  })

  return <section aria-label="本机 CLI 设置" className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">选择已安装的 CLI。</p>
      <Button variant="outline" disabled={busy||dirty} onClick={()=>void scan()}>{scanned?'重新扫描':'扫描本机 CLI'}</Button>
    </div>
    {!scanned&&<p className="py-4 text-sm text-muted-foreground">扫描本机已安装的 CLI。</p>}
    <Accordion type="single" collapsible value={open} onValueChange={value=>{
      if(busy||dirty)return
      setOpen(value);setMessage('')
      if(value==='codex'&&installation)void run(()=>load(installation))
    }}>
      {current.map(item=><AccordionItem key={item.kind} value={item.kind}>
        <AccordionTrigger aria-label={`配置 ${item.name}`} disabled={busy||dirty}>
          <span className="flex flex-col items-start gap-1"><span>{item.name}</span><span className="text-xs font-normal text-muted-foreground">{item.version||'版本未核实'}{item.kind!=='codex'?' · 暂不支持聊天':''}</span></span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5">
          {item.kind!=='codex'?<p className="text-sm text-muted-foreground">当前仅支持通过 Codex CLI 聊天。</p>:<>
            {item.error&&<p role="alert" className="text-sm text-destructive">{item.error}</p>}
            <form className="flex flex-col gap-5" onSubmit={e=>{
              e.preventDefault();void run(async()=>{
                const next=editing?await aiApi.updateProfile(profile,''):await aiApi.configure(profile,'')
                setProfile(next);setEditing(next.id);setDirty(false);onChange(next);setMessage('设置已保存。')
              })
            }}>
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <div className="flex items-center justify-between gap-2"><FieldLabel htmlFor="cli-model">模型</FieldLabel><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>void run(()=>refreshCatalog(item.path))}>刷新列表</Button></div>
                  <NativeSelect id="cli-model" aria-label="CLI 模型" className="w-full" disabled={busy} value={mode==='selected'?`model:${profile.model}`:mode} onChange={e=>{
                    const value=e.target.value
                    setProfile(p=>({...p,cliModelMode:value==='inherit'?'inherit':value==='custom'?'custom':'selected',model:value==='inherit'||value==='custom'?'':value.slice(6)}))
                    setDirty(true);setMessage('')
                  }}>
                    <NativeSelectOption value="inherit">跟随 CLI 设置{catalog?.currentModel?`（当前 ${catalog.currentModel}）`:''}</NativeSelectOption>
                    {selectedMissing&&<NativeSelectOption value={`model:${profile.model}`}>已保存：{profile.model}（未在目录中核实）</NativeSelectOption>}
                    {catalog?.models.map(m=><NativeSelectOption key={m.model} value={`model:${m.model}`}>{m.displayName} · {m.model}</NativeSelectOption>)}
                    <NativeSelectOption value="custom">自定义模型 ID</NativeSelectOption>
                  </NativeSelect>
                  {!catalog&&<FieldDescription>未能读取模型列表，请刷新重试。</FieldDescription>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="cli-effort">推理强度</FieldLabel>
                  <NativeSelect id="cli-effort" aria-label="CLI 推理强度" className="w-full" disabled={busy||(!efforts.length&&!profile.reasoningEffort)} value={profile.reasoningEffort??'inherit'} onChange={e=>field('reasoningEffort',e.target.value==='inherit'?null:e.target.value)}>
                    <NativeSelectOption value="inherit">跟随 CLI 设置{catalog?.currentEffort?`（当前 ${catalog.currentEffort}）`:''}</NativeSelectOption>
                    {invalidEffort&&<NativeSelectOption value={profile.reasoningEffort!}>原选择：{profile.reasoningEffort}（请重新选择）</NativeSelectOption>}
                    {efforts.map(e=><NativeSelectOption key={e.reasoningEffort} value={e.reasoningEffort}>{e.reasoningEffort}</NativeSelectOption>)}
                  </NativeSelect>
                  <FieldDescription>{invalidEffort?'原强度未在当前模型能力中核实，请重新选择。':!efforts.length?'CLI 未提供该模型的可选强度，当前沿用 CLI 设置。':''}</FieldDescription>
                </Field>
                {mode==='custom'&&<Field className="sm:col-span-2"><FieldLabel htmlFor="cli-custom">自定义模型 ID</FieldLabel><Input id="cli-custom" aria-label="CLI 自定义模型 ID" disabled={busy} value={profile.model} onChange={e=>field('model',e.target.value)} required/><FieldDescription>自定义 ID 未经模型目录核实。</FieldDescription></Field>}
              </FieldGroup>
              {catalog?.models.length===0&&<p role="status" className="text-sm text-muted-foreground">没有可用的模型列表，请检查 CLI 登录状态后刷新。</p>}
              <details><summary className="cursor-pointer text-sm text-muted-foreground">高级设置与诊断</summary>
                <div className="mt-3 flex flex-col gap-3 text-xs text-muted-foreground"><p className="break-all">系统默认 CLI：{item.path}</p><p>{updated?`目录更新于 ${new Date(updated).toLocaleTimeString()}`:'目录未更新'} · 版本 {item.version}</p><p>跟随设置在新聊天首次发送时解析；已有聊天保留实际模型。不会修改 CLI 全局设置。</p></div>
                <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel htmlFor="cli-context">上下文字符预算</FieldLabel><Input id="cli-context" aria-label="CLI 上下文字符预算" type="number" disabled={busy} value={profile.contextChars} onChange={e=>field('contextChars',Number(e.target.value))}/></Field>
                  <Field><FieldLabel htmlFor="cli-output">本机输出预算（每单位 16 字节）</FieldLabel><Input id="cli-output" type="number" disabled={busy} value={profile.maxOutputTokens} onChange={e=>field('maxOutputTokens',Number(e.target.value))}/></Field>
                </FieldGroup>
              </details>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button disabled={busy||invalidEffort||invalidModel}>保存设置</Button>
                <Button type="button" variant="outline" disabled={busy||invalidEffort||invalidModel} onClick={()=>void test()}>测试连接</Button>
                {saved&&<Button type="button" variant="ghost" disabled={busy||dirty||preferences?.defaultProfileId===saved.id} onClick={()=>void run(async()=>{await aiApi.setDefault(saved.id);onChange();setMessage('已设为新聊天默认服务。')})}>{preferences?.defaultProfileId===saved.id?'已是聊天默认':'设为聊天默认'}</Button>}
                {dirty&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>void run(async()=>{await load(item);setDirty(false)})}>放弃修改</Button>}
              </div>
              <p className="text-xs text-muted-foreground">测试会发送一条简短消息，可能消耗服务额度。</p>
            </form>
          </>}
        </AccordionContent>
      </AccordionItem>)}
    </Accordion>
    {dirty&&<p className="text-xs text-muted-foreground">修改尚未保存，请保存或放弃后再切换或重新扫描。</p>}
    {testing&&<Button variant="outline" onClick={()=>void aiApi.cancelTest(testing).then(()=>setMessage('正在停止测试…')).catch(e=>setMessage(errorMessage(e)))}>停止测试</Button>}
    {busy&&<p role="status" className="text-sm">{testing?'正在检查 CLI 和模型连接…':'正在读取 CLI…'}</p>}
    {message&&<p role="status" aria-live="polite" className="whitespace-pre-wrap text-sm">{message}</p>}
  </section>
}
