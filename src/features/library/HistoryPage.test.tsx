// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { HistoryPage, type HistoryHandle } from './HistoryPage'
import { libraryApi, type HistoryVersion } from './api'
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), libraryApi: { read: vi.fn(), begin: vi.fn(), history: vi.fn(), version: vi.fn(), mark: vi.fn(), restore: vi.fn() } }))
const record = { id:'entry', title:'当前标题',recordDate:'2026-10-19',createdTimezone:'Asia/Shanghai',createdAt:1,updatedAt:3,contentVersion:2,checkpointId:'base',document:{type:'doc',content:[{type:'paragraph'}]},tags:[] }
const version: HistoryVersion = { summary:{id:'old',createdAt:1,important:false,referenced:false,currentCheckpoint:false,restorable:true,restoredFromId:null,excerpt:'历史正文'},document:{type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'历史正文'}]}]},snapshot:{title:'旧标题',recordDate:'2026-10-17',tags:[{id:'tag',name:'旧标签'}],document:{type:'doc'}} }
function setup() {
  vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true}
  vi.mocked(libraryApi.history).mockResolvedValue({items:[version.summary],nextBefore:null});vi.mocked(libraryApi.version).mockResolvedValue(version);vi.mocked(libraryApi.mark).mockResolvedValue(undefined)
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const click=(text:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text || b.textContent?.includes(text));expect(button).toBeTruthy();button!.click()}
  const close=vi.fn(),restored=vi.fn(),view=createRef<HistoryHandle>()
  return {host,root,click,close,restored,view,render:()=>root.render(<HistoryPage ref={view} record={record} sessionId="session" onClose={close} onRestored={restored}/>)}
}
it('previews full history read-only, marks important and restores only on confirmation',async()=>{
  const t=setup();vi.mocked(libraryApi.restore).mockResolvedValue({record:{...record,title:'旧标题',contentVersion:3},sessionId:'new-session',recovered:null,recoveredTags:[]})
  try{
    await act(async()=>t.render());expect(t.host.querySelector('dialog')).toBeNull();expect(t.host.querySelector('[aria-label="日记历史与恢复"]')).not.toBeNull();expect(t.host.textContent).toContain('当前标题');expect([...t.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('恢复此版本'))!.disabled).toBe(true);await act(async()=>t.click('历史正文'))
    expect(t.host.textContent).toContain('旧标签');expect(t.host.querySelector('[aria-label="历史正文（只读）"]')!.getAttribute('contenteditable')).toBe('false');expect(t.host.querySelector('h2')?.textContent).toBe('记录历史');expect(t.host.querySelector('[aria-label="历史正文（只读）"] h2')?.textContent).toBe('历史正文')
    await act(async()=>t.click('标记为重要'));expect(libraryApi.mark).toHaveBeenCalledWith('entry','old',true)
    await act(async()=>t.click('恢复此版本'));expect(libraryApi.restore).not.toHaveBeenCalled()
    await act(async()=>t.click('确认恢复为新版本'));expect(libraryApi.restore).toHaveBeenCalledWith(expect.objectContaining({recordId:'entry',revisionId:'old',expectedContentVersion:2,sessionId:'session'}));expect(t.restored).toHaveBeenCalledWith(expect.objectContaining({sessionId:'new-session'}))
  }finally{await act(async()=>t.root.unmount());t.host.remove()}
})
it('retries the same request after an uncertain response and keeps the editor blocked until resolved',async()=>{
  const t=setup();vi.mocked(libraryApi.restore).mockRejectedValueOnce(new Error('合成响应丢失')).mockRejectedValueOnce({code:'storage_busy',message:'合成写锁'}).mockResolvedValueOnce({record,sessionId:'new',recovered:null,recoveredTags:[]})
  try{
    await act(async()=>t.render());await act(async()=>t.click('历史正文'));await act(async()=>t.click('恢复此版本'));await act(async()=>t.click('确认恢复为新版本'))
    expect(t.host.querySelector('[role="alert"]')!.textContent).toContain('尚未确认');const close=[...t.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='返回编辑')!;expect(close.disabled).toBe(true);expect(t.view.current!.canLeave()).toBe(false)
    await act(async()=>t.click('重试同一恢复请求'));expect(close.disabled).toBe(true);expect(t.restored).not.toHaveBeenCalled();await act(async()=>t.click('重试同一恢复请求'));expect(libraryApi.restore).toHaveBeenCalledTimes(3);expect(vi.mocked(libraryApi.restore).mock.calls[0][0]).toEqual(vi.mocked(libraryApi.restore).mock.calls[2][0]);expect(t.restored).toHaveBeenCalledTimes(1)
  }finally{await act(async()=>t.root.unmount());t.host.remove()}
})
it('never restores legacy history without full metadata and leaves the current record intact on conflict',async()=>{
  const t=setup();vi.mocked(libraryApi.version).mockResolvedValueOnce({...version,snapshot:null,summary:{...version.summary,restorable:false}})
  try{
    await act(async()=>t.render());await act(async()=>t.click('历史正文'));expect(t.host.textContent).toContain('不能完整恢复');expect([...t.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='恢复此版本')!.disabled).toBe(true)
    vi.mocked(libraryApi.version).mockResolvedValue(version);await act(async()=>t.click('历史正文'));await act(async()=>t.click('恢复此版本'));vi.mocked(libraryApi.restore).mockRejectedValue({code:'conflict',message:'内容已更新'});await act(async()=>t.click('确认恢复为新版本'))
    expect(t.restored).not.toHaveBeenCalled();expect(t.host.textContent).toContain('内容已更新');await act(async()=>t.click('返回编辑'));expect(t.close).toHaveBeenCalledTimes(1)
  }finally{await act(async()=>t.root.unmount());t.host.remove()}
})

it('can reconcile an uncertain restore by rereading authoritative content before returning to editing',async()=>{
  const t=setup();vi.mocked(libraryApi.restore).mockRejectedValue(new Error('合成响应丢失'));vi.mocked(libraryApi.read).mockResolvedValue({...record,title:'实际已恢复',contentVersion:3});vi.mocked(libraryApi.begin).mockResolvedValue({record:{...record,title:'实际已恢复',contentVersion:3},sessionId:'reconciled',recovered:null,recoveredTags:[]})
  try{
    await act(async()=>t.render());await act(async()=>t.click('历史正文'));await act(async()=>t.click('恢复此版本'));await act(async()=>t.click('确认恢复为新版本'));await act(async()=>t.click('重新读取当前已保存内容'))
    expect(libraryApi.begin).toHaveBeenCalledWith('entry',3);expect(t.restored).toHaveBeenCalledWith(expect.objectContaining({sessionId:'reconciled'}))
  }finally{await act(async()=>t.root.unmount());t.host.remove()}
})

it('allows leaving during a read-only history fetch',async()=>{
 const t=setup();let finish!:(value:{items:HistoryVersion['summary'][];nextBefore:null})=>void;vi.mocked(libraryApi.history).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 try{await act(()=>t.render());expect(t.view.current!.canLeave()).toBe(true);await act(()=>t.click('返回编辑'));expect(t.close).toHaveBeenCalledOnce();await act(()=>finish({items:[],nextBefore:null}))}finally{await act(()=>t.root.unmount());t.host.remove()}
})
