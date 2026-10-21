// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LibraryWorkspace } from './LibraryWorkspace'
import { libraryApi } from './api'
vi.mock('@/shared/runtime', () => ({ desktopAvailable: true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), libraryApi: { history: vi.fn(), version: vi.fn(), mark: vi.fn(), restore: vi.fn(), recoveries: vi.fn().mockResolvedValue([]), recovery: vi.fn().mockResolvedValue(null), begin: vi.fn(), end: vi.fn().mockResolvedValue(undefined), list: vi.fn(), query: vi.fn(async(query:{offset:number})=>{const rows=await libraryApi.list(query.offset);return {items:(rows??[]).map(item=>({...item,kind:'text',tags:[],hasImages:false,matchField:null})),total:rows?.length??0,nextOffset:null,days:[],tags:[]}}), preview:vi.fn(), read: vi.fn(), create: vi.fn(), save: vi.fn(), tag: vi.fn(), exit: vi.fn(), export: vi.fn() } }))
it('guards navigation on failure and discards only after explicit choice', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const record = { id: 'entry', title: '原始标题', recordDate: '2026-10-15', createdTimezone: 'Asia/Shanghai', createdAt: 0, updatedAt: 0, contentVersion: 0, checkpointId: 'version', document: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] }
  vi.mocked(libraryApi.list).mockResolvedValue([{ id: 'entry', title: record.title, recordDate: record.recordDate, excerpt: '' }])
  vi.mocked(libraryApi.read).mockResolvedValue(record)
  vi.mocked(libraryApi.create).mockResolvedValue(record)
  vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:"session",recovered:null,recoveredTags:[]})
  vi.mocked(libraryApi.save).mockRejectedValue({ code: 'write_failed', message: '合成保存失败' })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const click = (text: string, within: ParentNode = host) => { const button = [...within.querySelectorAll('button')].find(b => b.textContent === text)!; expect(button).toBeTruthy(); button.click() }
  try {
    await act(async () => { root.render(<LibraryWorkspace />) })
    await act(async () => { host.querySelector<HTMLButtonElement>('aside button[aria-current]')?.click(); [...host.querySelectorAll<HTMLButtonElement>('aside button')].find(b => b.textContent?.includes('原始标题'))!.click() })
    const input = () => host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), '未保存标题'); input().dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => click('新建记录'))
    expect(libraryApi.create).not.toHaveBeenCalled()
    await act(async () => click('保存并继续', host.querySelector('dialog')!))
    expect(host.querySelector('dialog [role="alert"]')!.textContent).toContain('合成保存失败')
    expect(input().value).toBe('未保存标题')
    await act(async () => click('继续编辑'))
    await act(async () => click('新建记录'))
    await act(async () => click('放弃修改并继续'))
    expect(input().value).toBe('原始标题')
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('previews durable recovery without opening an editor until explicitly chosen', async () => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const record = { id: 'entry', title: '已保存标题', recordDate: '2026-10-15', createdTimezone: 'Asia/Shanghai', createdAt: 0, updatedAt: 0, contentVersion: 0, checkpointId: 'version', document: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] }
  const input = { recordId: 'entry', requestId: 'request', sessionId: 'old-session', editSequence: 2, baseContentVersion: 0, baseCheckpointId: 'version', title: null, recordDate: record.recordDate, document: record.document, tagIds: [], attachmentIds: [] }
  vi.mocked(libraryApi.list).mockResolvedValue([])
  vi.mocked(libraryApi.read).mockResolvedValue(record)
  vi.mocked(libraryApi.recoveries).mockResolvedValue([{recordId:'entry',title:record.title,writtenAt:1}])
  vi.mocked(libraryApi.recovery).mockResolvedValue({sessionId:'old-session',editSequence:2,writtenAt:1,input,tags:[]})
  vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'new-session',recovered:input,recoveredTags:[]})
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(<LibraryWorkspace />) })
    expect(host.querySelector('dialog')!.textContent).toContain('当前已保存')
    expect(host.querySelector('[aria-label="记录标题"]')).toBeNull()
    expect(libraryApi.begin).not.toHaveBeenCalled()
    expect(libraryApi.save).not.toHaveBeenCalled()
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === '恢复到编辑器')!.click() })
    expect(libraryApi.begin).toHaveBeenCalledWith('entry',0,{sessionId:'old-session',editSequence:2,action:'restore'})
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('')
  } finally { await act(async () => root.unmount()); host.remove() }
})
it('leaves without a confirmation after automatic persistence completes', async () => {
  vi.clearAllMocks(); vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const record = { id:'saved',title:'已保存记录',recordDate:'2026-10-16',createdTimezone:'Asia/Shanghai',createdAt:0,updatedAt:0,contentVersion: 0, checkpointId:'version',document:{type:'doc',content:[{type:'paragraph'}]},tags:[] }
  vi.mocked(libraryApi.recoveries).mockResolvedValue([])
  vi.mocked(libraryApi.recovery).mockResolvedValue(null)
  vi.mocked(libraryApi.list).mockResolvedValue([{id:record.id,title:record.title,recordDate:record.recordDate,excerpt:''}])
  vi.mocked(libraryApi.read).mockResolvedValue(record)
  vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'session',recovered:null,recoveredTags:[]})
  vi.mocked(libraryApi.create).mockResolvedValue({...record,id:'new'})
  vi.mocked(libraryApi.save).mockResolvedValue({recordId:record.id,contentVersion: 0, checkpointId:'version',requestId:'request',sessionId:'session',editSequence:1,savedAt:1})
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  try {
    await act(async()=>{root.render(<LibraryWorkspace />)})
    await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>('aside button')].find(b=>b.textContent?.includes(record.title))!.click()})
    const input=host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'新标题');input.dispatchEvent(new Event('input',{bubbles:true}))})
    await act(async()=>{await vi.advanceTimersByTimeAsync(800)})
    await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='新建记录')!.click()})
    expect(libraryApi.create).toHaveBeenCalledTimes(1)
    expect(host.querySelector('dialog')).toBeNull()
  } finally {await act(async()=>root.unmount());host.remove();vi.useRealTimers()}
})
it('locks accepted edits throughout target loading and resumes after target failure or cancelled recovery', async()=>{
  vi.clearAllMocks();vi.useFakeTimers()
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  HTMLDialogElement.prototype.showModal=function(){this.open=true}
  const a={id:'a',title:'记录A',recordDate:'2026-10-19',createdTimezone:'Asia/Shanghai',createdAt:0,updatedAt:0,contentVersion:0,checkpointId:'version',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
  const b={...a,id:'b',title:'记录B'}
  vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null)
  vi.mocked(libraryApi.list).mockResolvedValue([a,b].map(r=>({...r,excerpt:''})))
  let reject!:(e:unknown)=>void
  vi.mocked(libraryApi.read).mockImplementation(id=>id==='a'?Promise.resolve(a):new Promise((_,r)=>{reject=r}))
  vi.mocked(libraryApi.begin).mockResolvedValue({record:a,sessionId:'session',recovered:null,recoveredTags:[]})
  vi.mocked(libraryApi.save).mockResolvedValue({recordId:'a',contentVersion:1,checkpointId:'version',requestId:'request',sessionId:'session',editSequence:1,savedAt:1})
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const click=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes(text))!.click()
  const edit=(text:string)=>{const input=host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))}
  try{
    await act(async()=>{root.render(<LibraryWorkspace/>)});await act(async()=>click('记录A'))
    await act(async()=>edit('已接受的新标题'))
    await act(async()=>click('记录B'))
    expect(vi.mocked(libraryApi.save).mock.calls[0][0].title).toBe('已接受的新标题')
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.readOnly).toBe(true)
    expect(host.querySelector('[aria-label="记录正文"]')!.getAttribute('contenteditable')).toBe('false')
    await act(async()=>edit('不接受的迟到输入'))
    await act(async()=>{reject({message:'合成读取失败'});await vi.advanceTimersByTimeAsync(3000)})
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.readOnly).toBe(false)
    vi.mocked(libraryApi.read).mockResolvedValue(b)
    vi.mocked(libraryApi.recovery).mockResolvedValue({sessionId:'old',editSequence:2,writtenAt:1,tags:[],input:{recordId:'b',sessionId:'old',editSequence:2,requestId:'r',baseContentVersion:0,baseCheckpointId:'version',title:null,recordDate:b.recordDate,document:b.document,tagIds:[],attachmentIds:[]}})
    await act(async()=>click('记录B'))
    expect(host.querySelector('dialog')).not.toBeNull()
    await act(async()=>click('稍后处理'))
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.readOnly).toBe(false)
    await act(async()=>edit('继续写作'))
    await act(async()=>{await vi.advanceTimersByTimeAsync(800)})
    expect(vi.mocked(libraryApi.save).mock.calls[vi.mocked(libraryApi.save).mock.calls.length - 1][0].title).toBe('继续写作')
    vi.mocked(libraryApi.recovery).mockResolvedValue(null)
    vi.mocked(libraryApi.begin).mockResolvedValue({record:b,sessionId:'b-session',recovered:null,recoveredTags:[]})
    await act(async()=>click('记录B'))
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('记录B')
    expect(host.querySelector('dialog')).toBeNull()
  }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers()}
})

it('saves before opening history, preserves failed edits and remounts the restored editing session', async () => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const record = {id:'history-entry',title:'当前标题',recordDate:'2026-10-19',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:2,contentVersion:1,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
  const historical = {id:'old',createdAt:1,important:false,referenced:false,currentCheckpoint:false,restorable:true,restoredFromId:null,excerpt:'历史合成正文'}
  vi.mocked(libraryApi.recoveries).mockResolvedValue([]); vi.mocked(libraryApi.recovery).mockResolvedValue(null)
  vi.mocked(libraryApi.list).mockResolvedValue([{...record,excerpt:''}]); vi.mocked(libraryApi.read).mockResolvedValue(record)
  vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'old-session',recovered:null,recoveredTags:[]})
  vi.mocked(libraryApi.save).mockRejectedValue({code:'storage_full',message:'合成磁盘满'})
  vi.mocked(libraryApi.history).mockResolvedValue({items:[historical],nextBefore:null})
  vi.mocked(libraryApi.version).mockResolvedValue({summary:historical,document:record.document,snapshot:{document:record.document,title:'恢复标题',recordDate:'2026-10-17',tags:[]}})
  vi.mocked(libraryApi.restore).mockResolvedValue({record:{...record,title:'恢复标题',recordDate:'2026-10-17',contentVersion:3,checkpointId:'restored'},sessionId:'restored-session',recovered:null,recoveredTags:[]})
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const click=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text || b.textContent?.includes(text))!.click()
  const input=()=>host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
  const edit=(value:string)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}))}
  try {
    await act(async()=>root.render(<LibraryWorkspace/>));await act(async()=>click('当前标题'));await act(async()=>edit('尚未落盘'))
    await act(async()=>click('查看历史'));expect(libraryApi.history).not.toHaveBeenCalled();expect(input().value).toBe('尚未落盘');expect(input().readOnly).toBe(false)
    vi.mocked(libraryApi.save).mockImplementation(async save=>({recordId:save.recordId,checkpointId:'base',contentVersion:2,requestId:save.requestId,sessionId:save.sessionId,editSequence:save.editSequence,savedAt:3}))
    vi.mocked(libraryApi.read).mockResolvedValue({...record,title:'尚未落盘',contentVersion:2})
    await act(async()=>click('查看历史'));expect(input().readOnly).toBe(true)
    await act(async()=>click('历史合成正文'));await act(async()=>click('恢复此版本'));await act(async()=>click('确认恢复为新版本'))
    expect(input().value).toBe('恢复标题');expect(input().readOnly).toBe(false)
    await act(async()=>edit('继续写作'));await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}))})
    expect(libraryApi.save).toHaveBeenLastCalledWith(expect.objectContaining({sessionId:'restored-session',baseContentVersion:3,baseCheckpointId:'restored',title:'继续写作'}))
  } finally { await act(async()=>root.unmount());host.remove() }
})

it('keeps an unsaved editor when filters hide its record and still guards opening a search result',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true}
 const record={id:'filter-entry',title:'筛选原记录',recordDate:'2026-10-21',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:1,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
 const item={id:record.id,title:record.title,recordDate:record.recordDate,excerpt:'',kind:'text' as const,tags:[],hasImages:false,matchField:null}
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.read).mockResolvedValue(record);vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'filter-session',recovered:null,recoveredTags:[]});vi.mocked(libraryApi.save).mockRejectedValue({code:'storage_full',message:'合成保存失败'})
 vi.mocked(libraryApi.query).mockImplementation(async query=>({items:query.keyword?[{...item,id:'other',title:'新的搜索结果'}]:[item],total:1,nextOffset:null,days:[],tags:[]}))
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 try{
  await act(async()=>root.render(<LibraryWorkspace/>));await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('筛选原记录'))!.click())
  const set=(label:string,value:string)=>{const node=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))}
  await act(async()=>set('记录标题','筛选后仍保留的修改'));await act(async()=>set('搜索记录','其他'));await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('筛选后仍保留的修改');expect(libraryApi.end).not.toHaveBeenCalled()
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('新的搜索结果'))!.click())
  expect(host.querySelector('dialog')!.textContent).toContain('有尚未保存');expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('筛选后仍保留的修改')
 }finally{await act(async()=>root.unmount());host.remove()}
})

it('opens the text editor after resolving recovery from a conversation preview',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true}
 const record={id:'recovered-text',title:'待恢复文字',recordDate:'2026-10-21',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:1,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
 const item={id:record.id,title:record.title,recordDate:record.recordDate,excerpt:'',kind:'text' as const,tags:[],hasImages:false,matchField:null}
 vi.mocked(libraryApi.query).mockResolvedValue({items:[{...item,id:'conversation',title:'合成对话',kind:'conversation'},item],total:2,nextOffset:null,days:[],tags:[]})
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.preview).mockResolvedValue({id:'conversation',title:'合成对话',recordDate:record.recordDate,kind:'conversation',document:null,messages:['合成预览正文']});vi.mocked(libraryApi.read).mockResolvedValue(record)
 vi.mocked(libraryApi.recovery).mockResolvedValue({sessionId:'old',editSequence:2,writtenAt:1,tags:[],input:{recordId:record.id,sessionId:'old',editSequence:2,requestId:'r',baseContentVersion:0,baseCheckpointId:'base',title:null,recordDate:record.recordDate,document:record.document,tagIds:[],attachmentIds:[]}})
 vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'new',recovered:null,recoveredTags:[]})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const click=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes(text))!.click()
 try{await act(async()=>root.render(<LibraryWorkspace/>));await act(async()=>click('合成对话'));expect(host.textContent).toContain('合成预览正文');await act(async()=>click('待恢复文字'));await act(async()=>click('丢弃此草稿'));expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('待恢复文字');expect(host.textContent).not.toContain('合成预览正文')}
 finally{await act(async()=>root.unmount());host.remove()}
})
