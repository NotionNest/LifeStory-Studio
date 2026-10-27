// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LibraryWorkspace, type LibraryHandle } from './LibraryWorkspace'
import { libraryApi } from './api'
vi.mock('@/shared/runtime', () => ({ desktopAvailable: true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), libraryApi: { trashImpact:vi.fn(),trashMove:vi.fn(),trashStatus:vi.fn(), history: vi.fn(), version: vi.fn(), mark: vi.fn(), restore: vi.fn(), recoveries: vi.fn().mockResolvedValue([]), recovery: vi.fn().mockResolvedValue(null), begin: vi.fn(), end: vi.fn().mockResolvedValue(undefined), list: vi.fn(), query: vi.fn(async(query:{offset:number})=>{const rows=await libraryApi.list(query.offset);return {items:(rows??[]).map(item=>({...item,kind:'text',tags:[],hasImages:false,matchField:null})),total:rows?.length??0,nextOffset:null,days:[],tags:[]}}), preview:vi.fn(), read: vi.fn(), create: vi.fn(), save: vi.fn(), tag: vi.fn(), exit: vi.fn(), export: vi.fn() } }))
async function menuAction(host:HTMLElement,label:string){
 await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
 await act(async()=>{[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent===label)!.click();await new Promise(resolve=>setTimeout(resolve,30))})
}
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
    await act(async () => { root.render(<LibraryWorkspace titlebarTarget={host} />) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="日记首页"] button[aria-current]')?.click(); [...host.querySelectorAll<HTMLButtonElement>('[aria-label="日记首页"] button')].find(b => b.textContent?.includes('原始标题'))!.click() })
    const input = () => host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
    await menuAction(host,'重命名')
    expect(document.activeElement).toBe(input());expect(input().selectionEnd).toBe(input().value.length)
    expect(host.querySelector('[aria-label="编辑工作区"] .workspace-toolbar [aria-label="删除日记"]')).toBeNull()
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), '未保存标题'); input().dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => click('返回日记'))
    expect(libraryApi.create).not.toHaveBeenCalled()
    await act(async () => click('保存并继续', host.querySelector('dialog')!))
    expect(host.querySelector('dialog [role="alert"]')!.textContent).toContain('合成保存失败')
    expect(input().value).toBe('未保存标题')
    await act(async () => click('继续编辑'))
    await act(async () => click('返回日记'))
    await act(async () => click('放弃修改并继续'))
    expect(host.querySelector('[aria-label="记录标题"]')).toBeNull()
    expect(host.querySelector<HTMLElement>('[aria-label="日记首页"]')!.hidden).toBe(false)
    expect(libraryApi.end).toHaveBeenCalledOnce()
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
    await act(async () => { root.render(<LibraryWorkspace titlebarTarget={host} />) })
    expect(host.querySelector('dialog')).toBeNull()
    await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>('[aria-label="待恢复草稿"] button')].find(button=>button.textContent?.includes(record.title))!.click()})
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
    await act(async()=>{root.render(<LibraryWorkspace titlebarTarget={host} />)})
    await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>('[aria-label="日记首页"] button')].find(b=>b.textContent?.includes(record.title))!.click()})
    const input=host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'新标题');input.dispatchEvent(new Event('input',{bubbles:true}))})
    await act(async()=>{await vi.advanceTimersByTimeAsync(800)})
    await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='返回日记')!.click()})
    expect(libraryApi.end).toHaveBeenCalledOnce()
    expect(host.querySelector('[aria-label="记录标题"]')).toBeNull()
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
    await act(async()=>{root.render(<LibraryWorkspace titlebarTarget={host}/>)});await act(async()=>click('记录A'))
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
    await act(async()=>root.render(<LibraryWorkspace titlebarTarget={host}/>));await act(async()=>click('当前标题'));await act(async()=>edit('尚未落盘'))
    await menuAction(host,'查看历史');expect(libraryApi.history).not.toHaveBeenCalled();expect(input().value).toBe('尚未落盘');expect(input().readOnly).toBe(false)
    vi.mocked(libraryApi.save).mockImplementation(async save=>({recordId:save.recordId,checkpointId:'base',contentVersion:2,requestId:save.requestId,sessionId:save.sessionId,editSequence:save.editSequence,savedAt:3}))
    vi.mocked(libraryApi.read).mockResolvedValue({...record,title:'尚未落盘',contentVersion:2})
    const scroll=host.querySelector<HTMLDivElement>('[aria-label="编辑工作区"] > div')!;scroll.scrollTop=123
    await menuAction(host,'查看历史');expect(input().readOnly).toBe(true);expect(host.querySelector('dialog')).toBeNull();expect(host.querySelector<HTMLElement>('[aria-label="编辑工作区"]')!.hidden).toBe(true);expect(host.querySelector('[aria-label="日记历史与恢复"]')).not.toBeNull()
    await act(async()=>click('返回编辑'));expect(scroll.scrollTop).toBe(123);expect(input().readOnly).toBe(false);expect(input().value).toBe('尚未落盘');expect(host.querySelector('[aria-label="日记历史与恢复"]')).toBeNull()
    await menuAction(host,'查看历史')
    await act(async()=>click('历史合成正文'));await act(async()=>click('恢复此版本'));await act(async()=>click('确认恢复为新版本'))
    expect(input().value).toBe('恢复标题');expect(input().readOnly).toBe(false)
    await act(async()=>edit('继续写作'));await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}))})
    expect(libraryApi.save).toHaveBeenLastCalledWith(expect.objectContaining({sessionId:'restored-session',baseContentVersion:3,baseCheckpointId:'restored',title:'继续写作'}))
  } finally { await act(async()=>root.unmount());host.remove() }
})

it('preserves the filtered home and defers a global command until saving succeeds',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true}
 const record={id:'filter-entry',title:'筛选原记录',recordDate:'2026-10-21',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:1,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
 const item={id:record.id,title:record.title,recordDate:record.recordDate,excerpt:'',kind:'text' as const,tags:[],hasImages:false,matchField:null}
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.read).mockResolvedValue(record);vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'filter-session',recovered:null,recoveredTags:[]});vi.mocked(libraryApi.save).mockRejectedValue({code:'storage_full',message:'合成保存失败'})
 vi.mocked(libraryApi.query).mockResolvedValue({items:[item],total:1,nextOffset:null,days:[],tags:[]})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),ref=createRef<LibraryHandle>(),action=vi.fn()
 const click=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===text)!.click()
 const set=(label:string,value:string)=>{const node=document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))}
 try{
  await act(async()=>root.render(<LibraryWorkspace titlebarTarget={host} ref={ref}/>));await act(()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')==='日期筛选')!.click());await act(()=>{const node=document.querySelector<HTMLSelectElement>('[aria-label="日期条件"]')!;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(node,'onOrAfter');node.dispatchEvent(new Event('change',{bubbles:true}))});await act(()=>set('筛选日期','2026-10-01'));await act(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  await act(()=>click('筛选原记录'));await act(()=>set('记录标题','仍需保存的修改'));await act(()=>ref.current!.run(action))
  expect(host.querySelector('dialog')!.textContent).toContain('有尚未保存');expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('仍需保存的修改');expect(libraryApi.end).not.toHaveBeenCalled();expect(action).not.toHaveBeenCalled()
  vi.mocked(libraryApi.save).mockImplementation(async input=>({recordId:input.recordId,contentVersion:1,checkpointId:'saved',requestId:input.requestId,sessionId:input.sessionId,editSequence:input.editSequence,savedAt:2}))
  await act(()=>click('保存并继续'))
  expect(host.querySelector('[aria-label="记录标题"]')).toBeNull();expect(host.querySelector('[aria-label="日期筛选"]')?.textContent).toContain('2026-10-01');expect(libraryApi.query).toHaveBeenLastCalledWith(expect.objectContaining({dateFrom:'2026-10-01'}));expect(libraryApi.end).toHaveBeenCalledOnce();expect(action).toHaveBeenCalledOnce()
 }finally{await act(()=>root.unmount());host.remove()}
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
 try{await act(async()=>root.render(<LibraryWorkspace titlebarTarget={host}/>));await act(async()=>click('合成对话'));expect(host.textContent).toContain('合成预览正文');await act(async()=>click('待恢复文字'));await act(async()=>click('丢弃此草稿'));expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('待恢复文字');expect(host.textContent).not.toContain('合成预览正文')}
 finally{await act(async()=>root.unmount());host.remove()}
})

it('reloads an adopted diary when returning from chat through the main navigation',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 let latest={id:'navigation-diary',title:'原来的日记',recordDate:'2026-10-22',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:1,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'原文'}]}]},tags:[]};
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.read).mockImplementation(async()=>latest);vi.mocked(libraryApi.begin).mockImplementation(async()=>({record:latest,sessionId:'navigation-session',recovered:null,recoveredTags:[]}));vi.mocked(libraryApi.query).mockResolvedValue({items:[{id:latest.id,title:latest.title,recordDate:latest.recordDate,excerpt:'原文',kind:'text',tags:[],hasImages:false,matchField:null}],total:1,nextOffset:null,days:[],tags:[]});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<LibraryWorkspace titlebarTarget={host} active/>));await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('原来的日记'))!.click());await act(async()=>root.render(<LibraryWorkspace titlebarTarget={host} active={false}/>));latest={...latest,title:'采用补充后的日记',contentVersion:1,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'原文与新补充'}]}]}};await act(async()=>root.render(<LibraryWorkspace titlebarTarget={host} active/>));expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('采用补充后的日记');expect(host.textContent).toContain('原文与新补充')}finally{await act(async()=>root.unmount());host.remove()}
})

it('keeps the editor usable when ending its session fails and retries the global home action',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const record={id:'end-session',title:'会话结束保护',recordDate:'2026-10-23',createdTimezone:'Asia/Shanghai',createdAt:0,updatedAt:0,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.read).mockResolvedValue(record);vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'end-session-id',recovered:null,recoveredTags:[]});vi.mocked(libraryApi.query).mockResolvedValue({items:[{...record,excerpt:'',kind:'text',hasImages:false,matchField:null}],total:1,nextOffset:null,days:[],tags:[]})
 const ref=createRef<LibraryHandle>(),navigate=vi.fn(),host=document.createElement('div'),root=createRoot(host);document.body.append(host)
 try{
  await act(()=>root.render(<LibraryWorkspace titlebarTarget={host} ref={ref} onNavigate={navigate}/>));await act(()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===record.title)!.click())
  vi.mocked(libraryApi.end).mockRejectedValueOnce({message:'合成结束失败'});await act(()=>ref.current!.home())
  expect(host.textContent).toContain('合成结束失败');expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.readOnly).toBe(false);expect(navigate).not.toHaveBeenCalled()
  await act(()=>ref.current!.home());expect(host.querySelector('[aria-label="记录标题"]')).toBeNull();expect(navigate).toHaveBeenCalledWith('diary');expect(libraryApi.end).toHaveBeenCalledTimes(2)
 }finally{await act(()=>root.unmount());host.remove()}
})
it('opens a linked diary with a guarded return to its chat source',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const record={id:'chat-linked',title:'聊天关联日记',recordDate:'2026-10-23',createdTimezone:'Asia/Shanghai',createdAt:0,updatedAt:0,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.read).mockResolvedValue(record);vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'linked-session',recovered:null,recoveredTags:[]});vi.mocked(libraryApi.query).mockResolvedValue({items:[],total:0,nextOffset:null,days:[],tags:[]})
 const ref=createRef<LibraryHandle>(),navigate=vi.fn(),host=document.createElement('div'),root=createRoot(host);document.body.append(host)
 try{
  await act(()=>root.render(<LibraryWorkspace titlebarTarget={host} ref={ref} onNavigate={navigate}/>));await act(()=>ref.current!.openDiary(record.id,'chat'));expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe(record.title)
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='返回聊天')!.click());expect(navigate).toHaveBeenCalledWith('chat');expect(libraryApi.end).toHaveBeenCalledWith(record.id,'linked-session')
 }finally{await act(()=>root.unmount());host.remove()}
})

it('opens diary chat without leaving the editor and synchronizes external changes before further saves',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const record={id:'side-diary',title:'侧边聊天日记',recordDate:'2026-10-26',createdTimezone:'Asia/Shanghai',createdAt:0,updatedAt:0,contentVersion:0,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]}
 vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.read).mockResolvedValue(record);vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'side-session',recovered:null,recoveredTags:[]});vi.mocked(libraryApi.query).mockResolvedValue({items:[],total:0,nextOffset:null,days:[],tags:[]})
 const ref=createRef<LibraryHandle>(),chat=vi.fn(),host=document.createElement('div'),root=createRoot(host);document.body.append(host)
 const input=()=>host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
 const edit=(value:string)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}))}
 try{
  await act(()=>root.render(<LibraryWorkspace titlebarTarget={host} ref={ref} onChat={chat}/>));await act(()=>ref.current!.openDiary(record.id))
  await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="聊聊这篇日记"]')!.click())
  expect(chat).toHaveBeenCalledWith(record.id);expect(input().value).toBe(record.title);expect(input().readOnly).toBe(false);expect(libraryApi.end).not.toHaveBeenCalled()
  await act(()=>edit('未保存的标题'));vi.mocked(libraryApi.save).mockRejectedValue({message:'合成保存失败'})
  const change=vi.fn();await act(async()=>{await expect(ref.current!.withSavedDiary(change)).rejects.toThrow('日记尚未保存')})
  expect(change).not.toHaveBeenCalled();expect(input().value).toBe('未保存的标题');expect(input().readOnly).toBe(false)
  vi.mocked(libraryApi.save).mockImplementation(async save=>({recordId:save.recordId,checkpointId:'base',contentVersion:1,requestId:save.requestId,sessionId:save.sessionId,editSequence:save.editSequence,savedAt:1}))
  const updated={...record,title:'聊天采用后的标题',contentVersion:2,checkpointId:'adopted'}
  await act(()=>ref.current!.withSavedDiary(async()=>{expect(input().readOnly).toBe(true);vi.mocked(libraryApi.read).mockResolvedValue(updated);vi.mocked(libraryApi.begin).mockResolvedValue({record:updated,sessionId:'after-chat',recovered:null,recoveredTags:[]})}))
  expect(input().value).toBe(updated.title);expect(input().readOnly).toBe(false)
  await act(()=>edit('采用后继续编辑'));await act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true})))
  expect(libraryApi.save).toHaveBeenLastCalledWith(expect.objectContaining({sessionId:'after-chat',baseContentVersion:2,title:'采用后继续编辑'}))
  vi.mocked(libraryApi.read).mockRejectedValueOnce({message:'合成重新读取失败'})
  await act(async()=>{await expect(ref.current!.withSavedDiary(async()=>{})).rejects.toMatchObject({message:'合成重新读取失败'})})
  expect(input().readOnly).toBe(true);expect(host.textContent).toContain('合成重新读取失败')
  vi.mocked(libraryApi.read).mockResolvedValue({...updated,contentVersion:3});vi.mocked(libraryApi.begin).mockResolvedValue({record:{...updated,contentVersion:3},sessionId:'retried',recovered:null,recoveredTags:[]})
  await act(()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='重新读取日记')!.click());expect(input().readOnly).toBe(false)
 }finally{await act(()=>root.unmount());host.remove()}
})

it('allows normal app navigation from the independent history page',async()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const record={id:'history-navigation',title:'合成历史导航',recordDate:'2026-10-27',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:2,contentVersion:1,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[]};vi.mocked(libraryApi.recoveries).mockResolvedValue([]);vi.mocked(libraryApi.recovery).mockResolvedValue(null);vi.mocked(libraryApi.list).mockResolvedValue([{...record,excerpt:''}]);vi.mocked(libraryApi.read).mockResolvedValue(record);vi.mocked(libraryApi.begin).mockResolvedValue({record,sessionId:'history-session',recovered:null,recoveredTags:[]});vi.mocked(libraryApi.history).mockResolvedValue({items:[],nextBefore:null});const host=document.createElement('div'),root=createRoot(host),ref=createRef<LibraryHandle>(),navigate=vi.fn();document.body.append(host)
 try{await act(async()=>root.render(<LibraryWorkspace ref={ref} titlebarTarget={host} onNavigate={navigate}/>));await act(async()=>ref.current!.openDiary('history-navigation'));await menuAction(host,'查看历史');expect(host.querySelector('[aria-label="日记历史与恢复"]')).not.toBeNull();await act(async()=>ref.current!.navigate('settings'));expect(navigate).toHaveBeenCalledWith('settings');expect(host.querySelector('[aria-label="日记历史与恢复"]')).toBeNull();expect(libraryApi.end).toHaveBeenCalledWith('history-navigation','history-session')}
 finally{await act(()=>root.unmount());host.remove()}
})
