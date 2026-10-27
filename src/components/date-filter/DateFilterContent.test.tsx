// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useResolvedDateCondition } from './useResolvedDateCondition'
import { DateFilterContent } from './DateFilterContent'
import { blankDateCondition, matchesDateCondition, resolveDateConstraint, type DateCondition } from './dateConditions'
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
Element.prototype.scrollIntoView=function(){}
async function setup(content:React.ReactNode){
 const host=document.createElement('div'),root=createRoot(host);document.body.append(host);await act(()=>root.render(content))
 const select=async(label:string,value:string)=>act(()=>{const node=host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('change',{bubbles:true}))})
 return {host,select,close:async()=>{await act(()=>root.unmount());host.remove()}}
}
it('implements all nine operators, start/end fields and real empty-value matching',async()=>{
 const rows=[{id:'无结束日期',start:'2026-10-20',end:null},{id:'日期完整',start:'2026-10-21',end:'2026-10-23'},{id:'无开始日期',start:null,end:'2026-10-25'}]
 function Harness(){const [value,setValue]=useState<DateCondition|null>(null);return <><DateFilterContent value={value} onChange={setValue}/><output>{rows.filter(row=>matchesDateCondition(row,value)).map(row=>row.id).join('、')}</output></>}
 const t=await setup(<Harness/>);try{
  expect(t.host.querySelectorAll('[aria-label="日期条件"] option')).toHaveLength(9)
  await t.select('日期字段','end');await t.select('日期条件','isEmpty');expect(t.host.querySelector('output')!.textContent).toBe('无结束日期');expect(t.host.querySelector('input[type="date"]')).toBeNull();expect(t.host.querySelector('[role="grid"]')).toBeNull()
  await t.select('日期条件','isNotEmpty');expect(t.host.querySelector('output')!.textContent).toBe('日期完整、无开始日期')
  await t.select('日期字段','start');expect(t.host.querySelector('output')!.textContent).toBe('无结束日期、日期完整')
  await t.select('日期条件','isEmpty');expect(t.host.querySelector('output')!.textContent).toBe('无开始日期')
 }finally{await t.close()}
})
it('enables only configured capabilities while keeping date selection usable',async()=>{
 const t=await setup(<DateFilterContent value={null} onChange={()=>{}} capabilities={{fields:[{value:'start',label:'记录日期'}],operators:['is','relative'],shortcuts:[],relativeDirections:['this'],relativeUnits:['week']}}/>);try{
  expect(t.host.querySelector('[aria-label="日期字段"]')).toBeNull();expect(t.host.textContent).toContain('记录日期');expect(t.host.querySelector('[aria-label="快捷日期"]')).toBeNull()
  expect([...t.host.querySelectorAll<HTMLOptionElement>('[aria-label="日期条件"] option')].map(option=>option.value)).toEqual(['is','relative'])
  await t.select('日期条件','relative');expect(t.host.querySelectorAll('[aria-label="相对日期单位"] option')).toHaveLength(1);expect(t.host.querySelectorAll('[aria-label="相对日期方向"] option')).toHaveLength(1)
 }finally{await t.close()}
})
it('resolves generic presence predicates and compares the chosen endpoint',()=>{
 expect(resolveDateConstraint({...blankDateCondition,operator:'isEmpty'})).toEqual({dateFrom:null,dateTo:null,presence:'empty'})
 const condition={...blankDateCondition,field:'end' as const,start:'2026-10-23'}
 expect(matchesDateCondition({start:'2026-10-23',end:'2026-10-24'},condition)).toBe(false)
 expect(matchesDateCondition({start:null,end:'2026-10-23'},condition)).toBe(true)
 expect(matchesDateCondition({start:'2026-10-23',end:null},condition)).toBe(false)
})

it('updates the shared relative-date resolver at midnight and after reactivation',async()=>{
 vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});vi.setSystemTime(new Date('2026-10-25T23:59:59'))
 const condition={...blankDateCondition,operator:'relative' as const,unit:'day' as const}
 function Clock({active=true}:{active?:boolean}){const range=useResolvedDateCondition(condition,active);return <output>{range.dateFrom}</output>}
 const host=document.createElement('div'),root=createRoot(host);document.body.append(host)
 try{
  await act(()=>root.render(<Clock/>));expect(host.textContent).toBe('2026-10-25')
  await act(async()=>{await vi.advanceTimersByTimeAsync(1100)});expect(host.textContent).toBe('2026-10-26')
  await act(()=>root.render(<Clock active={false}/>));vi.setSystemTime(new Date('2026-10-27T12:00:00'));await act(()=>root.render(<Clock/>));expect(host.textContent).toBe('2026-10-27')
 }finally{await act(()=>root.unmount());host.remove();vi.useRealTimers()}
})
