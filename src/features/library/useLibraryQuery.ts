import { useCallback, useEffect, useRef, useState } from 'react'
import { desktopAvailable } from '@/shared/runtime'
import { libraryApi, errorMessage, localDate, type LibraryQuery, type QueryPage } from './api'
export const emptyFilters = { keyword:'',dateFrom:null,dateTo:null,kinds:[],tagIds:[],tagMode:'all',hasImages:null } satisfies Omit<LibraryQuery,'month'|'offset'>
export type Filters=Omit<LibraryQuery,'month'|'offset'>
export function useLibraryQuery() {
  const [filters,setFilters]=useState<Filters>(emptyFilters),[view,setView]=useState<'timeline'|'calendar'>('timeline'),[month,setMonth]=useState(localDate().slice(0,7))
  const [page,setPage]=useState<QueryPage>({items:[],total:0,nextOffset:null,days:[],tags:[]}),[loading,setLoading]=useState(desktopAvailable),[error,setError]=useState('')
  const sequence=useRef(0),alive=useRef(true),current=useRef({filters,view,month});current.current={filters,view,month}
  const refresh=useCallback(async(offset=0)=>{
    if(!desktopAvailable)return
    const request=++sequence.current;setLoading(true);setError('')
    const {filters,view,month}=current.current
    try {
      const next=await libraryApi.query({...filters,month:view==='calendar'?month:null,offset})
      if(!alive.current||request!==sequence.current)return
      setPage(old=>({...next,items:offset?[...old.items,...next.items.filter(i=>!old.items.some(o=>o.id===i.id))]:next.items}))
    }catch(cause){if(alive.current&&request===sequence.current)setError(errorMessage(cause))}
    finally{if(alive.current&&request===sequence.current)setLoading(false)}
  },[])
  useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;sequence.current++}},[filters,view,month,refresh])
  const change=(next:Filters)=>{sequence.current++;setPage(old=>({...old,items:[],total:0,nextOffset:null}));setFilters(next)}
  return {filters,change,view,setView:(next:'timeline'|'calendar')=>{if(next!==current.current.view){sequence.current++;setView(next)}},month,setMonth:(next:string)=>{if(next!==current.current.month){sequence.current++;setMonth(next)}},page,loading,error,refresh}
}
