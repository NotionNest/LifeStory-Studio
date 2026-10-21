// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { libraryApi, type QueryPage } from './api'
import { useLibraryQuery } from './useLibraryQuery'
import { LibraryBrowser } from './LibraryBrowser'
vi.mock('@/shared/runtime',()=>({desktopAvailable:true}))
vi.mock('./api',async original=>({...await original<typeof import('./api')>(),libraryApi:{query:vi.fn()}}))
const item={id:'entry',title:'合成旅行记录',recordDate:'2026-10-20',excerpt:'这是一段旅行记录',kind:'text' as const,tags:[],hasImages:false,matchField:null}
const page:QueryPage={items:[item],total:1,nextOffset:null,days:[{date:'2026-10-20',count:1}],tags:[{id:'t1',name:'生活'},{id:'t2',name:'旅行'}]}
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.mocked(libraryApi.query).mockResolvedValue(structuredClone(page))})
function setup(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const open=vi.fn();function Harness(){const browser=useLibraryQuery();return <LibraryBrowser browser={browser} working={false} onCreate={()=>{}} onOpen={open}/>};const click=(text:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text||b.getAttribute('aria-label')===text);expect(button).toBeTruthy();button!.click()};const input=(selector:string,value:string)=>{const node=host.querySelector<HTMLInputElement>(selector)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))};return {host,root,Harness,click,input,open}}
it('keeps keyword and other filters when choosing calendar days and switching views',async()=>{
 const t=setup();try{
  await act(async()=>t.root.render(<t.Harness/>));await act(async()=>t.input('[aria-label="搜索记录"]','旅行'));await act(async()=>t.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  await act(async()=>t.click('组合筛选'));await act(async()=>{const check=t.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[3];check.click()})
  await act(async()=>t.click('日历'));await act(async()=>t.input('[aria-label="日历月份"]','2026-10'))
  await act(async()=>t.click('2026-10-20，1 条记录'))
  expect(libraryApi.query).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'旅行',tagIds:['t1'],dateFrom:'2026-10-20',dateTo:'2026-10-20',month:'2026-10'}))
  await act(async()=>t.click('时间线'));expect(libraryApi.query).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'旅行',tagIds:['t1'],dateFrom:'2026-10-20',month:null}))
  await act(async()=>t.click('清除全部筛选'));expect(libraryApi.query).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'',dateFrom:null,tagIds:[]}))
 }finally{await act(async()=>t.root.unmount());t.host.remove()}
})
it('ignores late query results and can retry a failed current query',async()=>{
 const t=setup();try{
  let resolveOld!:(page:QueryPage)=>void
  vi.mocked(libraryApi.query).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve}))
  await act(async()=>t.root.render(<t.Harness/>));vi.mocked(libraryApi.query).mockResolvedValueOnce({...page,items:[{...item,title:'新的命中'}]})
  await act(async()=>{t.input('[aria-label="搜索记录"]','新');t.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
  // Submit after React applies the input, as in a real user interaction.
  await act(async()=>t.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  await act(async()=>resolveOld({...page,items:[{...item,title:'不应显示的旧结果'}]}));expect(t.host.textContent).not.toContain('不应显示的旧结果')
  vi.mocked(libraryApi.query).mockRejectedValueOnce({message:'合成查询失败'});await act(async()=>t.click('组合筛选'));await act(async()=>t.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  expect(t.host.textContent).toContain('合成查询失败');await act(async()=>t.click('重试查询'));expect(t.host.textContent).not.toContain('合成查询失败')
 }finally{await act(async()=>t.root.unmount());t.host.remove()}
})
it('opens corresponding kinds, highlights literal hits and deduplicates paged results',async()=>{
 const t=setup();try{
  vi.mocked(libraryApi.query).mockResolvedValueOnce({...page,items:[{...item,kind:'conversation',matchField:'message'}],total:2,nextOffset:1})
  await act(async()=>t.root.render(<t.Harness/>));const entry=[...t.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes(item.title))!;await act(async()=>entry.click());expect(t.open).toHaveBeenCalledWith(expect.objectContaining({kind:'conversation'}))
  vi.mocked(libraryApi.query).mockResolvedValueOnce({...page,items:[item,{...item,id:'second',title:'第二条'}],total:2});await act(async()=>t.click('加载更多'));expect([...t.host.querySelectorAll('button')].filter(b=>b.textContent?.includes(item.title))).toHaveLength(1);expect(t.host.textContent).toContain('第二条')
 }finally{await act(async()=>t.root.unmount());t.host.remove()}
})
