// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { it,expect,vi } from 'vitest'
import { TrashPanel,DeleteRecordDialog } from './TrashPanel'
import { libraryApi,type TrashItem } from './api'
vi.mock('./api',async original=>({...await original<typeof import('./api')>(),libraryApi:{trashStatus:vi.fn().mockResolvedValue('active'),trashList:vi.fn(),trashMove:vi.fn(),trashImpact:vi.fn(),trashRestore:vi.fn(),trashPurge:vi.fn()}}))
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true}
const item:TrashItem={id:'trash',title:'合成删除记录',kind:'text',recordDate:'2026-10-21',deletedAt:1000,purgeAt:2592001000}
function setup(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);return{host,root,click:(label:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!.click(),end:async()=>{await act(async()=>root.unmount());host.remove()}}}
it('requires a second explicit confirmation, keeps cleanup failures visible and retries',async()=>{
 vi.clearAllMocks();vi.mocked(libraryApi.trashList).mockResolvedValue({items:[item],nextOffset:null,cleanupError:null});vi.mocked(libraryApi.trashPurge).mockRejectedValue({message:'记录已清除，图片待清理'});const ui=setup()
 try{await act(async()=>ui.root.render(<TrashPanel/>));await act(async()=>ui.click('彻底删除…'));expect(libraryApi.trashPurge).not.toHaveBeenCalled();expect([...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='确认彻底删除')!.disabled).toBe(true);await act(async()=>ui.click('取消彻底删除'));expect(ui.host.querySelector('[role=alertdialog]')).toBeNull();await act(async()=>ui.click('彻底删除…'));await act(async()=>ui.host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());await act(async()=>ui.click('确认彻底删除'));expect(libraryApi.trashPurge).toHaveBeenCalledWith(item);expect(ui.host.querySelector('[role=alert]')!.textContent).toContain('图片待清理');vi.mocked(libraryApi.trashList).mockResolvedValue({items:[],nextOffset:null,cleanupError:null});await act(async()=>ui.click('刷新并重试清理'));expect(ui.host.textContent).toContain('回收站为空')}
 finally{await ui.end()}
})
it('restores records and leaves failed restore actionable',async()=>{
 vi.clearAllMocks();vi.mocked(libraryApi.trashList).mockResolvedValue({items:[item],nextOffset:null,cleanupError:null});vi.mocked(libraryApi.trashRestore).mockRejectedValueOnce({message:'合成恢复失败'}).mockResolvedValue(undefined);const ui=setup()
 try{await act(async()=>ui.root.render(<TrashPanel/>));await act(async()=>ui.click('恢复记录'));expect(ui.host.textContent).toContain('合成恢复失败');vi.mocked(libraryApi.trashList).mockResolvedValue({items:[],nextOffset:null,cleanupError:null});await act(async()=>ui.click('恢复记录'));expect(libraryApi.trashRestore).toHaveBeenLastCalledWith(item);expect(ui.host.textContent).toContain('记录已恢复')}
 finally{await ui.end()}
})
it('shows source impact and rereads conflicts before moving to trash',async()=>{
 vi.clearAllMocks();const impact={recordId:'a',title:'合成原文',contentVersion:2,impactToken:'old',references:[{id:'draft',title:'独立稿件',kind:'draft' as const}]};const done=vi.fn();vi.mocked(libraryApi.trashMove).mockRejectedValueOnce({message:'引用影响已变化'}).mockResolvedValue(undefined);vi.mocked(libraryApi.trashImpact).mockResolvedValue({...impact,impactToken:'new'});const ui=setup()
 try{await act(async()=>ui.root.render(<DeleteRecordDialog impact={impact} onClose={vi.fn()} onDeleted={done}/>));expect(ui.host.textContent).toContain('独立稿件');expect(libraryApi.trashMove).not.toHaveBeenCalled();await act(async()=>ui.click('移入回收站'));expect(done).not.toHaveBeenCalled();await act(async()=>ui.click('重新核对影响'));await act(async()=>ui.click('移入回收站'));expect(libraryApi.trashMove).toHaveBeenLastCalledWith({...impact,impactToken:'new'});expect(done).toHaveBeenCalledOnce()}
 finally{await ui.end()}
})

it('keeps editing paused until an uncertain move is reconciled',async()=>{
 vi.clearAllMocks();vi.mocked(libraryApi.trashMove).mockRejectedValue({message:'响应丢失'});vi.mocked(libraryApi.trashStatus).mockRejectedValueOnce(new Error('离线')).mockResolvedValue('trash');const done=vi.fn(),close=vi.fn(),ui=setup();
 try{await act(async()=>ui.root.render(<DeleteRecordDialog impact={{recordId:'a',title:null,contentVersion:0,impactToken:'token',references:[]}} onClose={close} onDeleted={done}/>));await act(async()=>ui.click('移入回收站'));expect([...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='取消')!.disabled).toBe(true);expect(done).not.toHaveBeenCalled();await act(async()=>ui.click('重新核对影响'));expect(done).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled()}
 finally{await ui.end()}
})
