import { useCallback, useEffect, useRef, useState } from 'react'
import { useResolvedDateCondition } from '@/components/date-filter/useResolvedDateCondition'
import { resolveDateCondition, type DateCondition } from './dateConditions'
import { desktopAvailable } from '@/shared/runtime'
import { libraryApi, errorMessage, localDate, type LibraryQuery, type QueryPage, type CalendarPage } from './api'
export const emptyFilters = { keyword:'',dateFrom:null,dateTo:null,kinds:[],tagIds:[],tagMode:'all',hasImages:null } satisfies Omit<LibraryQuery,'month'|'offset'>
export type Filters = Omit<LibraryQuery,'month'|'offset'>
export function calendarDates(month: string) {
  const first = new Date(`${month}-01T12:00:00`)
  const last = new Date(first); last.setMonth(last.getMonth()+1,0)
  const length = Math.ceil(((first.getDay()+6)%7+last.getDate())/7)*7
  first.setDate(first.getDate()-(first.getDay()+6)%7)
  return Array.from({length},(_,index)=>{const day=new Date(first);day.setDate(first.getDate()+index);return localDate(day)})
}
const initialPage: QueryPage = {items:[],total:0,nextOffset:null,days:[],tags:[]}
export function useLibraryQuery(active = true) {
  const [dateCondition,setDateConditionState]=useState<DateCondition|null>(null)
  const [filters,setFilters]=useState<Filters>(emptyFilters),[view,setView]=useState<'timeline'|'calendar'>('timeline'),[month,setMonth]=useState(localDate().slice(0,7))
  const [page,setPage]=useState<QueryPage>(initialPage),[calendar,setCalendar]=useState<CalendarPage>({days:[],tags:[]}),[loading,setLoading]=useState(desktopAvailable),[error,setError]=useState('')
  const sequence=useRef(0),alive=useRef(true),loaded=useRef(1),current=useRef({filters,view,month,active});current.current={filters,view,month,active}
  const refresh=useCallback(async(offset?:number)=>{
    if(!desktopAvailable||!current.current.active)return
    const request=++sequence.current;setLoading(true);setError('')
    const {filters,view,month}=current.current
    try {
      if(view==='calendar'){
        const dates=calendarDates(month)
        const next=await libraryApi.calendar({filters:{...filters,month:null,offset:0},from:dates[0],to:dates[dates.length-1]})
        if(alive.current&&request===sequence.current)setCalendar(next)
      }else{
        let next=await libraryApi.query({...filters,month:null,offset:offset??0})
        const items=[...next.items];let fetched=1
        if(offset===undefined){
          for(let index=1;index<loaded.current&&next.nextOffset!==null;index++){
            if(!alive.current||request!==sequence.current)return
            next=await libraryApi.query({...filters,month:null,offset:next.nextOffset});items.push(...next.items);fetched++
          }
        }
        if(!alive.current||request!==sequence.current)return
        if(offset)loaded.current++;else loaded.current=fetched
        setPage(old=>({...next,items:[...new Map([...(offset?old.items:[]),...items].map(item=>[item.id,item])).values()]}))
      }
    }catch(cause){if(alive.current&&request===sequence.current)setError(errorMessage(cause))}
    finally{if(alive.current&&request===sequence.current)setLoading(false)}
  },[])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++}},[])
  useEffect(()=>{sequence.current++;if(active)void refresh()},[filters,view,month,active,refresh])
  const apply=useCallback((next:Filters)=>{sequence.current++;loaded.current=1;setPage(old=>({...initialPage,tags:old.tags}));setCalendar(old=>({days:[],tags:old.tags}));setFilters(next)},[])
  const change=(next:Filters)=>{if(next.dateFrom!==current.current.filters.dateFrom||next.dateTo!==current.current.filters.dateTo)setDateConditionState(null);apply(next)}
  const setDateCondition=(next:DateCondition|null)=>{
    const range=resolveDateCondition(next),old=current.current.filters
    setDateConditionState(next)
    if(range.dateFrom!==old.dateFrom||range.dateTo!==old.dateTo)apply({...old,...range})
  }
  useEffect(()=>{if(filters.hasImages!==null)apply({...filters,hasImages:null})},[filters.hasImages,apply])
  const liveDate=useResolvedDateCondition(dateCondition,active)
  useEffect(()=>{
    if(!active||!dateCondition||(!dateCondition.shortcut&&dateCondition.operator!=='relative'))return
    const old=current.current.filters
    if(liveDate.dateFrom!==old.dateFrom||liveDate.dateTo!==old.dateTo)apply({...old,dateFrom:liveDate.dateFrom,dateTo:liveDate.dateTo})
  },[active,dateCondition,liveDate.dateFrom,liveDate.dateTo,apply])
  return {filters,change,dateCondition,setDateCondition,view,setView,month,setMonth,page,calendar,loading,error,refresh}
}
