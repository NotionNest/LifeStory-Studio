import { useEffect, useState } from 'react'
import { zhCN } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { blankDateCondition, dateOperators, dateShortcuts, resolveDateConstraint, formatCalendarDate, dateFields, relativeDirections, relativeUnits, type DateCondition, type DateFilterCapabilities } from './dateConditions'
import { useResolvedDateCondition } from './useResolvedDateCondition'
const parse=(value:string|null)=>value?new Date(`${value}T12:00:00`):undefined

export interface DateFilterContentProps {value:DateCondition|null;onChange:(condition:DateCondition|null)=>void;capabilities?:DateFilterCapabilities}
export function DateFilterContent({value,onChange,capabilities={}}:DateFilterContentProps) {
 const fields=capabilities.fields??dateFields
 const operators=capabilities.operators??Object.keys(dateOperators) as DateCondition['operator'][]
 const shortcuts=capabilities.shortcuts??Object.keys(dateShortcuts) as (keyof typeof dateShortcuts)[]
 const units=capabilities.relativeUnits??Object.keys(relativeUnits) as DateCondition['unit'][]
 const directions=capabilities.relativeDirections??Object.keys(relativeDirections) as DateCondition['direction'][]
 if(!fields.length||!operators.length||!directions.length||!units.length)throw new Error('日期组件至少需要一个字段、条件及相对日期方向和单位')
 if(value&&(!fields.some(field=>field.value===value.field)||!operators.includes(value.operator)||(value.shortcut&&!shortcuts.includes(value.shortcut))||(value.operator==='relative'&&(!directions.includes(value.direction)||!units.includes(value.unit)))))throw new Error('当前场景未启用此日期条件')
 const defaults:DateCondition={...blankDateCondition,field:fields[0].value,operator:operators.includes('is')?'is':operators[0],direction:directions.includes('this')?'this':directions[0],unit:units.includes('week')?'week':units[0]}
 const [draft,setDraft]=useState<DateCondition>(value??defaults),[month,setMonth]=useState<Date>(parse(value?.start??null)??new Date())
 useEffect(()=>{const next=value??defaults;setDraft(next);setMonth(parse(resolveDateConstraint(next).dateFrom??next.start)??new Date())},[value])
 const empty=draft.operator==='isEmpty'||draft.operator==='isNotEmpty'
 const invalid=draft.operator==='between'&&Boolean(draft.start&&draft.end&&draft.start>draft.end)
 const update=(next:DateCondition)=>{
  setDraft(next)
  if(next.start&&next.start!==draft.start)setMonth(parse(next.start)!)
  if(next.operator==='between'&&(!next.start||!next.end||next.start>next.end))return
  onChange(next)
  const range=resolveDateConstraint(next);if((next.shortcut||next.operator==='relative')&&range.dateFrom)setMonth(parse(range.dateFrom)!)
 }
 const range=useResolvedDateCondition(draft),selected=draft.operator==='relative'||draft.operator==='between'?{from:parse(range.dateFrom),to:parse(range.dateTo)}:undefined
 return <div>
   <div className="mb-3 flex items-center justify-between gap-2">{fields.length===1?<span className="text-sm text-muted-foreground">{fields[0].label}</span>:<NativeSelect size="sm" aria-label="日期字段" value={draft.field} onChange={event=>update({...draft,field:event.target.value as DateCondition['field']})}>{fields.map(field=><NativeSelectOption key={field.value} value={field.value}>{field.label}</NativeSelectOption>)}</NativeSelect>}{operators.length>1&&<NativeSelect size="sm" aria-label="日期条件" value={draft.operator} onChange={event=>{const operator=event.target.value as DateCondition['operator'];update({...draft,operator,start:draft.shortcut?resolveDateConstraint({...draft,operator:'is'}).dateFrom:draft.start,shortcut:operator==='between'||operator==='relative'?null:draft.shortcut})}}>{operators.map(value=><NativeSelectOption key={value} value={value}>{dateOperators[value]}</NativeSelectOption>)}</NativeSelect>}{value&&<Button size="xs" variant="ghost" onClick={()=>{setDraft(defaults);onChange(null)}}>清除日期</Button>}</div>
   {!empty&&(draft.operator==='relative'?<div className="mb-3 grid grid-cols-2 gap-2"><NativeSelect className="w-full" aria-label="相对日期方向" value={draft.direction} onChange={event=>update({...draft,direction:event.target.value as DateCondition['direction']})}>{directions.map(value=><NativeSelectOption key={value} value={value}>{relativeDirections[value]}</NativeSelectOption>)}</NativeSelect><NativeSelect className="w-full" aria-label="相对日期单位" value={draft.unit} onChange={event=>update({...draft,unit:event.target.value as DateCondition['unit']})}>{units.map(value=><NativeSelectOption key={value} value={value}>{relativeUnits[value]}</NativeSelectOption>)}</NativeSelect></div>:<>
    {draft.operator!=='between'&&shortcuts.length>0&&<NativeSelect className="mb-2 w-full" aria-label="快捷日期" value={draft.shortcut??'custom'} onChange={event=>{const value=event.target.value;update({...draft,shortcut:value==='custom'?null:value as DateCondition['shortcut']})}}><NativeSelectOption value="custom">自定义日期</NativeSelectOption>{shortcuts.map(value=><NativeSelectOption key={value} value={value}>{dateShortcuts[value]}</NativeSelectOption>)}</NativeSelect>}
    <div className={`mb-2 grid gap-2 ${draft.operator==='between'?'grid-cols-2':'grid-cols-1'}`}><Input type="date" aria-label={draft.operator==='between'?'筛选开始日期':'筛选日期'} value={draft.shortcut?resolveDateConstraint({...draft,operator:'is'}).dateFrom??'':draft.start??''} onChange={event=>update({...draft,start:event.target.value||null,shortcut:null})}/>{draft.operator==='between'&&<Input type="date" aria-label="筛选结束日期" value={draft.end??''} onChange={event=>update({...draft,end:event.target.value||null})}/>}</div>
   </>)}
   {invalid&&<p role="alert" className="mb-2 text-sm text-destructive">开始日期不能晚于结束日期</p>}
   {!empty&&(draft.operator==='relative'||draft.operator==='between'?<Calendar className="w-full p-0 [--cell-size:2.25rem]" classNames={{root:'w-full'}} locale={zhCN} weekStartsOn={1} month={month} onMonthChange={setMonth} mode="range" selected={selected} disabled={!operators.includes('between')} onSelect={value=>update({...draft,operator:'between',shortcut:null,start:value?.from?formatCalendarDate(value.from):null,end:value?.to?formatCalendarDate(value.to):null})}/>:<Calendar className="w-full p-0 [--cell-size:2.25rem]" classNames={{root:'w-full'}} locale={zhCN} weekStartsOn={1} month={month} onMonthChange={setMonth} mode="single" selected={parse(draft.shortcut?resolveDateConstraint({...draft,operator:'is'}).dateFrom:draft.start)} onSelect={value=>update({...draft,shortcut:null,start:value?formatCalendarDate(value):null})}/>)}
 </div>
}
