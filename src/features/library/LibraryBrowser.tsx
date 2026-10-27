import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List, Image as ImageIcon, PenLine, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateFilter } from './DateFilter'
import { TagFilter } from './TagFilter'
import { libraryApi, errorMessage, localDate, type SearchItem, type QueryPage } from './api'
import { type useLibraryQuery, type Filters, emptyFilters, calendarDates } from './useLibraryQuery'
export const kindLabels={text:'日记',conversation:'对话',draft:'日记'} as const
const itemTitle=(item:SearchItem)=>item.title||item.excerpt.split('\n')[0]||'无标题记录'
function Highlight({text,keyword}:{text:string;keyword:string}){
 if(!keyword)return <>{text}</>
 const position=text.toLowerCase().indexOf(keyword.toLowerCase());if(position<0)return <>{text}</>
 return <>{text.slice(0,position)}<mark className="rounded bg-primary/15 text-foreground">{text.slice(position,position+keyword.length)}</mark>{text.slice(position+keyword.length)}</>
}
function DayEntries({date,filters,working,onOpen,onCreate}:{date:string;filters:Filters;working:boolean;onOpen:(item:SearchItem)=>void;onCreate:(date?:string)=>void}){
 const [page,setPage]=useState<QueryPage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const sequence=useRef(0)
 const load=async(offset=0)=>{
  const request=++sequence.current;setLoading(true);setError('')
  try{
   const from=filters.dateFrom&&filters.dateFrom>date?filters.dateFrom:date,to=filters.dateTo&&filters.dateTo<date?filters.dateTo:date
   const next=from>to?{items:[],total:0,nextOffset:null,days:[],tags:[]}:await libraryApi.query({...filters,dateFrom:from,dateTo:to,month:null,offset})
   if(request===sequence.current)setPage(old=>({...next,items:offset?[...(old?.items??[]),...next.items.filter(item=>!old?.items.some(previous=>previous.id===item.id))]:next.items}))
  }catch(cause){if(request===sequence.current)setError(errorMessage(cause))}
  finally{if(request===sequence.current)setLoading(false)}
 }
 useEffect(()=>{void load();return()=>{sequence.current++}},[date,filters])
 return <><div className="flex items-center justify-between gap-3"><h2 id={`day-${date}`} className="font-medium">{date}</h2><Button size="icon-sm" variant="ghost" aria-label={`在 ${date} 新建日记`} disabled={working} onClick={()=>onCreate(date)}><Plus aria-hidden="true"/></Button></div>
  <div className="flex max-h-72 flex-col gap-1 overflow-y-auto" aria-busy={loading}>
   {page?.items.map(item=><Button key={item.id} variant="ghost" className="h-auto min-h-8 justify-start whitespace-normal text-left" disabled={working||loading} onClick={()=>onOpen(item)}>{itemTitle(item)}</Button>)}
   {loading&&<p role="status" className="p-2 text-sm text-muted-foreground">正在查询…</p>}
   {!loading&&!error&&page?.items.length===0&&<p className="p-2 text-sm text-muted-foreground">暂无记录</p>}
   {error&&<div role="alert" className="p-2 text-sm text-destructive">{error}<Button size="sm" variant="ghost" onClick={()=>void load(page?.nextOffset??0)}>重试查询</Button></div>}
   {page?.nextOffset!=null&&!error&&<Button variant="ghost" disabled={loading||working} onClick={()=>void load(page.nextOffset!)}>加载更多</Button>}
  </div></>
}
export function LibraryBrowser({browser,active=true,working,onOpen,onCreate}:{browser:ReturnType<typeof useLibraryQuery>;active?:boolean;working:boolean;onOpen:(item:SearchItem)=>void;onCreate:(date?:string)=>void}){
 const {filters,change:applyFilters,page,calendar,loading,error,refresh,view,setView,month,setMonth}=browser
 const [day,setDay]=useState<string|null>(null)
 const viewport=useRef<HTMLDivElement>(null),restore=useRef(true)
 const positions=useRef<Record<string,{top:number;left:number;id?:string;index?:number;offset?:number}>>({})
 const change=(next:Filters)=>{positions.current={};if(viewport.current){viewport.current.scrollTop=0;viewport.current.scrollLeft=0}applyFilters(next)}
 const remember=(id?:string)=>{
  const element=viewport.current;if(!element)return
  const buttons=[...element.querySelectorAll<HTMLElement>('[data-record-id]')]
  const target=buttons.find(button=>button.dataset.recordId===id)??buttons.find(button=>button===document.activeElement)??buttons.find(button=>button.getBoundingClientRect().bottom>element.getBoundingClientRect().top)
  positions.current[view]={top:element.scrollTop,left:element.scrollLeft,id:target?.dataset.recordId,index:target?buttons.indexOf(target):undefined,offset:target?target.getBoundingClientRect().top-element.getBoundingClientRect().top:undefined}
 }
 useLayoutEffect(()=>{
  if(!active){restore.current=true;return}
  if(loading){restore.current=true;return}
  if(!restore.current)return
  const element=viewport.current,position=positions.current[view]
  if(element&&position){
   element.scrollTop=position.top;element.scrollLeft=position.left
   const buttons=[...element.querySelectorAll<HTMLElement>('[data-record-id]')]
   const target=buttons.find(button=>button.dataset.recordId===position.id)??buttons[Math.min(position.index??0,buttons.length-1)]
   if(target){element.scrollTop+=target.getBoundingClientRect().top-element.getBoundingClientRect().top-(position.offset??0);target.focus({preventScroll:true})}
   else element.querySelector<HTMLElement>('button')?.focus({preventScroll:true})
  }
  restore.current=false
 },[active,loading,view,page,calendar])
 useEffect(()=>{setDay(null)},[filters,month,view,active])
 const open=(item:SearchItem)=>{remember(day?`day:${day}`:item.id);setDay(null);onOpen(item)}
 const create=(date?:string)=>{remember();setDay(null);onCreate(date)}
 const changeView=(value:string)=>{if(value!=='timeline'&&value!=='calendar')return;remember();restore.current=true;setView(value)}
 const dates=calendarDates(month),today=localDate(),tags=view==='calendar'?calendar.tags:page.tags
 const changeMonth=(amount:number)=>{const date=new Date(`${month}-01T12:00:00`);date.setMonth(date.getMonth()+amount);setMonth(localDate(date).slice(0,7));viewport.current?.scrollTo?.({top:0});positions.current.calendar={top:0,left:0}}
 const filtered=Boolean(filters.keyword||filters.dateFrom||filters.dateTo||filters.kinds.length||filters.tagIds.length)
 const field='rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
 return <Tabs value={view} onValueChange={changeView} className="h-full min-h-0 gap-0">
  <header className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-6 py-3 lg:px-8">
   <h1 className="sr-only">日记</h1>
   <div className="flex flex-wrap items-center gap-3">
    <TabsList variant="line"><TabsTrigger value="timeline"><List aria-hidden="true"/>列表</TabsTrigger><TabsTrigger value="calendar"><CalendarDays aria-hidden="true"/>日历</TabsTrigger></TabsList>

    <div className="ml-auto flex items-center gap-1"><DateFilter condition={browser.dateCondition} active={active} onChange={condition=>{positions.current={};browser.setDateCondition(condition)}}/><TagFilter filters={filters} tags={tags} active={active} onChange={change}/>{filtered&&<Button size="xs" variant="ghost" onClick={()=>{browser.setDateCondition(null);change(emptyFilters)}}>清除全部筛选</Button>}</div>
    <Button size="sm" disabled={working} onClick={()=>create()}><PenLine data-icon="inline-start" aria-hidden="true"/>新建日记</Button>
   </div>
   {view==='calendar'&&<div className="flex items-center justify-between gap-3"><input type="month" aria-label="日历月份" value={month} className={field} onChange={event=>{if(event.target.value)setMonth(event.target.value)}}/><div className="flex items-center gap-1"><Button size="icon-sm" variant="ghost" aria-label="上个月" onClick={()=>changeMonth(-1)}><ChevronLeft aria-hidden="true"/></Button><Button size="sm" variant="ghost" onClick={()=>setMonth(today.slice(0,7))}>今天</Button><Button size="icon-sm" variant="ghost" aria-label="下个月" onClick={()=>changeMonth(1)}><ChevronRight aria-hidden="true"/></Button></div></div>}
  </header>
  <div ref={viewport} onScroll={()=>remember()} className="diary-browser-scroll min-h-0 flex-1 overflow-auto px-6 pb-8 lg:px-8" aria-busy={loading}>
   {error&&<div role="alert" className="flex items-center gap-2 py-4 text-sm text-destructive">{error}<Button size="sm" variant="ghost" onClick={()=>void refresh()}>重试查询</Button></div>}
   {loading&&<p role="status" className="py-4 text-sm text-muted-foreground">正在查询记录…</p>}
   <TabsContent value="timeline" forceMount hidden={view!=='timeline'} className="mt-0">
    <Table><TableHeader className="sticky top-0 bg-background"><TableRow><TableHead className="w-3/5">日记</TableHead><TableHead className="w-36">记录日期</TableHead><TableHead>标签</TableHead></TableRow></TableHeader><TableBody>{page.items.map(item=><TableRow key={item.id} className="cursor-pointer" onClick={()=>{if(!working&&!loading)open(item)}}><TableCell className="max-w-0"><button data-record-id={item.id} disabled={working||loading} className="flex min-h-10 w-full items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={event=>{event.stopPropagation();open(item)}}><span className="truncate font-medium"><Highlight text={itemTitle(item)} keyword={filters.keyword}/></span>{item.hasImages&&<ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="含图片"/>}</button></TableCell><TableCell className="text-muted-foreground">{item.recordDate||'日期待补充'}</TableCell><TableCell><div className="flex flex-wrap gap-1">{item.tags.map(tag=><Badge variant="secondary" key={tag.id}>{tag.name}</Badge>)}</div></TableCell></TableRow>)}</TableBody></Table>
    {!loading&&!error&&page.items.length===0&&<p role="status" className="py-8 text-sm text-muted-foreground">{filtered?'没有符合条件的记录。':'暂无记录'}</p>}
    {page.nextOffset!==null&&!error&&<Button className="mt-4" variant="ghost" disabled={working||loading} onClick={()=>void refresh(page.nextOffset!)}>加载更多</Button>}
   </TabsContent>
   <TabsContent value="calendar" forceMount hidden={view!=='calendar'} className="mt-0 min-w-[700px]">
    <section aria-label="记录日历" className="grid grid-cols-7">
     {['周一','周二','周三','周四','周五','周六','周日'].map(label=><div key={label} className="sticky top-0 border-b bg-background py-3 text-center text-xs text-muted-foreground">{label}</div>)}
     {dates.map(date=>{const result=calendar.days.find(value=>value.date===date);return <div key={date} className={`group/day flex min-h-36 min-w-0 flex-col gap-1 border-b border-r border-border/70 p-2 [&:nth-child(7n+1)]:border-l ${date.slice(0,7)!==month?'bg-muted/30':''}`}>
      <div className="flex items-center justify-between"><Popover open={active&&day===date} onOpenChange={value=>setDay(value?date:null)}><PopoverTrigger asChild><Button size="icon-sm" variant={date===today?'default':day===date?'secondary':'ghost'} data-record-id={`day:${date}`} aria-label={`查看 ${date} 的记录`} className="rounded-full" aria-current={date===today?'date':undefined}>{Number(date.slice(-2))}</Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]" aria-labelledby={`day-${date}`} onCloseAutoFocus={event=>{if(!active)event.preventDefault()}}><DayEntries date={date} filters={filters} working={working} onOpen={open} onCreate={create}/></PopoverContent></Popover>
       <Button size="icon-xs" variant="ghost" aria-label={`在 ${date} 新建日记`} disabled={working} className="opacity-0 group-hover/day:opacity-100 group-focus-within/day:opacity-100 focus-visible:opacity-100" onClick={()=>create(date)}><Plus aria-hidden="true"/></Button>
      </div>
      {!loading&&!error&&result?.items.map(item=><Button key={item.id} data-record-id={item.id} size="sm" variant="ghost" className="w-full justify-start" disabled={working} onClick={()=>open(item)}><span className="truncate"><Highlight text={itemTitle(item)} keyword={filters.keyword}/></span></Button>)}
      {!loading&&!error&&result&&result.count>3&&<Button size="xs" variant="ghost" className="justify-start" onClick={()=>setDay(date)}>还有 {result.count-3} 篇</Button>}
     </div>})}
    </section>
   </TabsContent>
  </div>
 </Tabs>
}
