import { useEffect, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ReasoningSummary({text,running=false}:{text?:string|null;running?:boolean}){
 return text?<details className="mb-2 text-sm text-muted-foreground" open={running||undefined}><summary className="cursor-pointer">推理摘要</summary><p className="mt-2 whitespace-pre-wrap leading-6">{text}</p></details>:null
}
export function MessageDetails({text,createdAt,durationMs,startedAt,running=false}:{text?:string;createdAt?:number;durationMs?:number|null;startedAt?:number;running?:boolean}){
 const [copied,setCopied]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(Date.now())
 useEffect(()=>{if(!running)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[running,startedAt])
 const elapsed=running&&startedAt!==undefined?Math.max(0,now-startedAt):durationMs
 const timestamp=createdAt===undefined?null:new Date(createdAt)
 return <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/65">
  {timestamp&&!Number.isNaN(timestamp.getTime())&&<time dateTime={timestamp.toISOString()} title={timestamp.toLocaleString()}>{timestamp.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>}
  {elapsed!=null&&<span>{running?'已用时':'用时'} {Math.max(0,elapsed/1000).toFixed(1)} 秒</span>}
  {text&&<Button type="button" size="icon-xs" variant="ghost" className="text-muted-foreground/65 hover:text-muted-foreground focus-visible:text-muted-foreground" aria-label={copied?'已复制消息':'复制消息'} title={copied?'已复制':'复制'} onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setError('')}catch{setError('复制失败，请重试')}}}>{copied?<CheckIcon/>:<CopyIcon/>}</Button>}
  {error&&<span role="alert" className="text-destructive">{error}</span>}
 </div>
}
