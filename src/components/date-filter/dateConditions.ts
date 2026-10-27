export function formatCalendarDate(date=new Date()){return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
const localDate=formatCalendarDate
export const dateOperators={is:'是',before:'早于',after:'晚于',onOrBefore:'不晚于',onOrAfter:'不早于',between:'介于',relative:'相对于今天',isEmpty:'为空白',isNotEmpty:'不为空白'} as const
export const dateShortcuts={today:'今天',tomorrow:'明天',yesterday:'昨天',weekBefore:'一周前',weekAfter:'一周后',monthBefore:'一个月前',monthAfter:'一个月后'} as const
export type DateCondition={field:'start'|'end';operator:keyof typeof dateOperators;start:string|null;end:string|null;shortcut:keyof typeof dateShortcuts|null;direction:'past'|'future'|'this';unit:'day'|'week'|'month'|'year'}
export const blankDateCondition:DateCondition={field:'start',operator:'is',start:null,end:null,shortcut:null,direction:'this',unit:'week'}
const parse=(date:string)=>new Date(`${date}T12:00:00`)
function shift(date:Date,unit:DateCondition['unit'],amount:number){
 const next=new Date(date)
 if(unit==='day'||unit==='week')next.setDate(next.getDate()+amount*(unit==='week'?7:1))
 else {const day=next.getDate();next.setDate(1);next.setMonth(next.getMonth()+amount*(unit==='year'?12:1));const last=new Date(next);last.setMonth(last.getMonth()+1,0);next.setDate(Math.min(day,last.getDate()))}
 return next
}
export function shortcutDate(shortcut:keyof typeof dateShortcuts,now=new Date()){
 const today=parse(localDate(now))
 const [unit,amount]:[DateCondition['unit'],number]=shortcut==='today'?['day',0]:shortcut==='tomorrow'?['day',1]:shortcut==='yesterday'?['day',-1]:shortcut==='weekBefore'?['week',-1]:shortcut==='weekAfter'?['week',1]:shortcut==='monthBefore'?['month',-1]:['month',1]
 return localDate(shift(today,unit,amount))
}
export function resolveDateConstraint(condition:DateCondition|null,now=new Date()):{dateFrom:string|null;dateTo:string|null;presence?:'empty'|'nonempty'}{
 if(!condition)return {dateFrom:null,dateTo:null}
 if(condition.operator==='isEmpty'||condition.operator==='isNotEmpty')return {dateFrom:null,dateTo:null,presence:condition.operator==='isEmpty'?'empty':'nonempty'}
 if(condition.operator==='relative'){
  const today=parse(localDate(now));let from=new Date(today),to=new Date(today)
  if(condition.direction==='past'){from=shift(today,condition.unit,-1);to=shift(today,'day',-1)}
  else if(condition.direction==='future'){from=shift(today,'day',1);to=shift(today,condition.unit,1)}
  else if(condition.unit==='week'){from.setDate(from.getDate()-(from.getDay()+6)%7);to=shift(from,'day',6)}
  else if(condition.unit==='month'){from.setDate(1);to.setMonth(to.getMonth()+1,0)}
  else if(condition.unit==='year'){from.setMonth(0,1);to.setMonth(11,31)}
  return {dateFrom:localDate(from),dateTo:localDate(to)}
 }
 const start=condition.shortcut?shortcutDate(condition.shortcut,now):condition.start
 if(!start)return {dateFrom:null,dateTo:null}
 switch(condition.operator){
  case 'is':return {dateFrom:start,dateTo:start}
  case 'before':return {dateFrom:null,dateTo:localDate(shift(parse(start),'day',-1))}
  case 'after':return {dateFrom:localDate(shift(parse(start),'day',1)),dateTo:null}
  case 'onOrBefore':return {dateFrom:null,dateTo:start}
  case 'onOrAfter':return {dateFrom:start,dateTo:null}
  case 'between':return {dateFrom:start,dateTo:condition.end}
 }
}
export function dateConditionLabel(condition:DateCondition|null){
 if(!condition)return '日期'
 if(condition.operator==='isEmpty'||condition.operator==='isNotEmpty')return dateOperators[condition.operator]
 if(condition.operator==='relative'){if(condition.direction==='this')return condition.unit==='day'?'今天':`本${{day:'天',week:'周',month:'月',year:'年'}[condition.unit]}`;return `${condition.direction==='past'?'过去':'未来'}${{day:'一天',week:'一周',month:'一个月',year:'一年'}[condition.unit]}`}
 const value=condition.shortcut?dateShortcuts[condition.shortcut]:condition.start
 if(!value)return '日期'
 return condition.operator==='between'?`${value} — ${condition.end??'…'}`:`${condition.operator==='is'?'':dateOperators[condition.operator]+' '}${value}`
}

export const dateFields=[{value:'start',label:'开始日期'},{value:'end',label:'结束日期'}] as const
export const relativeUnits={day:'天',week:'周',month:'月',year:'年'} as const
export const relativeDirections={past:'过去',future:'未来',this:'本'} as const
export interface DateFilterCapabilities {
 fields?:readonly {value:DateCondition['field'];label:string}[]
 operators?:readonly DateCondition['operator'][]
 shortcuts?:readonly (keyof typeof dateShortcuts)[]
 relativeUnits?:readonly DateCondition['unit'][]
 relativeDirections?:readonly DateCondition['direction'][]
}
export function matchesDateCondition(values:{start:string|null;end:string|null},condition:DateCondition|null,now=new Date()){
 if(!condition)return true
 const range=resolveDateConstraint(condition,now),value=values[condition.field]
 if(range.presence==='empty')return value===null
 if(range.presence==='nonempty')return value!==null
 if(!range.dateFrom&&!range.dateTo)return true
 return value!==null&&(!range.dateFrom||value>=range.dateFrom)&&(!range.dateTo||value<=range.dateTo)
}
