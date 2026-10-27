// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TagManager } from './TagManager'
import { libraryApi, type Tag, type TagUsage } from './api'
vi.mock('./api',async original=>({...await original<typeof import('./api')>(),libraryApi:{tagCatalog:vi.fn(),tag:vi.fn()}}))
class Observer{observe(){}unobserve(){}disconnect(){}}
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:Observer})
const initial:TagUsage[]=[{id:'life',name:'生活',count:2,current:true},{id:'work',name:'工作',count:0,current:false}]
async function setup(){
 vi.clearAllMocks();vi.mocked(libraryApi.tagCatalog).mockResolvedValue(initial)
 const busy=vi.fn(),host=document.createElement('div'),root=createRoot(host);document.body.append(host)
 function Harness(){const [tags,setTags]=useState<Tag[]>([{id:'life',name:'生活'}]);return <><TagManager recordId="diary" tags={tags} onChange={setTags} onBusy={busy} disabled={false}/><output>{tags.map(tag=>tag.name).join('、')}</output></>}
 await act(()=>root.render(<Harness/>))
 const click=async(label:string)=>act(()=>{const node=[...document.querySelectorAll<HTMLElement>('button,input[type="checkbox"]')].find(node=>node.getAttribute('aria-label')===label||node.textContent===label)!;expect(node).toBeTruthy();node.click()})
 const search=async(value:string)=>act(()=>{const input=document.querySelector<HTMLInputElement>('[aria-label="搜索或创建标签"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
 await click('管理标签')
 return {host,busy,root,click,search,close:async()=>{await act(()=>root.unmount());host.remove()}}
}
it('multiselects with real usage counts, filters current diary tags and creates from search',async()=>{
 const ui=await setup()
 try{
  expect(libraryApi.tagCatalog).toHaveBeenCalledWith('diary')
  expect(document.querySelector<HTMLInputElement>('[aria-label="选择标签 生活"]')!.checked).toBe(true)
  await ui.click('选择标签 工作');expect(ui.host.querySelector('output')!.textContent).toBe('生活、工作')
  expect(document.querySelector('[aria-label="选择标签 工作"]')?.closest('label')?.textContent).toBe('工作1')
  await ui.click('选择标签 生活');expect(document.querySelector('[aria-label="选择标签 生活"]')?.closest('label')?.textContent).toBe('生活1')
  await act(()=>document.querySelector<HTMLElement>('[role="tab"][data-state="inactive"]')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})))
  expect(document.querySelector('[aria-label="选择标签 生活"]')).toBeNull();expect(document.querySelector('[aria-label="选择标签 工作"]')).not.toBeNull()
  vi.mocked(libraryApi.tag).mockResolvedValue({id:'art',name:'绘画'});vi.mocked(libraryApi.tagCatalog).mockResolvedValue([...initial,{id:'art',name:'绘画',count:0,current:false}])
  await ui.search('绘画');await ui.click('创建“绘画”')
  expect(libraryApi.tag).toHaveBeenCalledWith('绘画');expect(ui.host.querySelector('output')!.textContent).toBe('工作、绘画')
  expect(document.querySelector<HTMLInputElement>('[aria-label="选择标签 绘画"]')!.checked).toBe(true)
  expect(document.querySelector('[aria-label="选择标签 绘画"]')?.closest('label')?.textContent).toBe('绘画1')
  expect(ui.busy).toHaveBeenLastCalledWith(false)
 }finally{await ui.close()}
})
it('retains selected tags after read failure and retries without creating a duplicate',async()=>{
 const ui=await setup()
 try{
  await ui.click('关闭管理标签');vi.mocked(libraryApi.tagCatalog).mockRejectedValueOnce({message:'合成读取失败'})
  await ui.click('管理标签');expect(document.querySelector('[role="alert"]')?.textContent).toContain('合成读取失败')
  expect(ui.host.querySelector('output')!.textContent).toBe('生活')
  await ui.click('重新读取标签');await ui.search('生活')
  expect([...document.querySelectorAll('button')].some(button=>button.textContent==='创建“生活”')).toBe(false)
  expect(libraryApi.tag).not.toHaveBeenCalled()
 }finally{await ui.close()}
})
it('blocks closing during creation and preserves a failed creation for retry',async()=>{
 const ui=await setup();let reject!:(cause:unknown)=>void
 try{
  vi.mocked(libraryApi.tag).mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail}))
  await ui.search('旅行');await ui.click('创建“旅行”')
  expect(document.querySelector<HTMLButtonElement>('button[aria-label="关闭管理标签"]')!.disabled).toBe(true)
  await act(async()=>{reject({message:'合成创建失败'});await Promise.resolve()});expect(document.querySelector('[role="alert"]')?.textContent).toContain('合成创建失败')
  expect(document.querySelector<HTMLInputElement>('[aria-label="搜索或创建标签"]')!.value).toBe('旅行')
  expect(ui.host.querySelector('output')!.textContent).toBe('生活');expect(ui.busy).toHaveBeenLastCalledWith(false)
 }finally{await ui.close()}
})
