// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LibraryWorkspace } from './LibraryWorkspace'
import { libraryApi } from './api'
vi.mock('@/shared/runtime', () => ({ desktopAvailable: true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), libraryApi: { recoveries: vi.fn().mockResolvedValue([]), recovery: vi.fn().mockResolvedValue(null), begin: vi.fn(), end: vi.fn().mockResolvedValue(undefined), list: vi.fn(), read: vi.fn(), create: vi.fn(), save: vi.fn(), tag: vi.fn(), exit: vi.fn(), export: vi.fn() } }))
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
