// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { PencilIcon, Trash2Icon, MessageCircleIcon } from 'lucide-react'
import { PageActions, type PageAction } from './PageActions'

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
function setup(){
 const host=document.createElement('div'),target=document.createElement('header'),input=document.createElement('input')
 document.body.append(target,host,input)
 const root=createRoot(host)
 return {host,target,input,render:async(actions:PageAction[]|null)=>act(()=>root.render(actions&&<PageActions target={target} actions={actions}/>)),open:async()=>act(()=>target.querySelector('button[aria-label="更多操作"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))),close:async()=>{await act(()=>root.unmount());target.remove();host.remove();input.remove()}}
}
it('renders in the titlebar, runs menu actions after closing, and clears when leaving the page',async()=>{
 const ui=setup(),chat=vi.fn(),remove=vi.fn()
 try{
  await ui.render([{id:'chat',label:'聊聊',icon:MessageCircleIcon,primary:true,onSelect:chat},{id:'rename',label:'重命名',icon:PencilIcon,onSelect:()=>{ui.input.focus();ui.input.select()}},{id:'delete',label:'删除日记',icon:Trash2Icon,destructive:true,onSelect:remove}])
  expect(ui.host.textContent).toBe('')
  await act(()=>ui.target.querySelector<HTMLButtonElement>('[aria-label="聊聊"]')!.click());expect(chat).toHaveBeenCalledOnce()
  await ui.open()
  const items=[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  expect(items.map(item=>item.textContent)).toEqual(['重命名','删除日记'])
  await act(async()=>{items[0].click();await new Promise(resolve=>setTimeout(resolve,30))})
  expect(document.querySelector('[role="menu"]')).toBeNull();expect(document.activeElement).toBe(ui.input);expect(remove).not.toHaveBeenCalled()
  await ui.open()
  await act(async()=>{[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item=>item.textContent==='删除日记')!.click();await new Promise(resolve=>setTimeout(resolve,30))})
  expect(remove).toHaveBeenCalledOnce()
  await ui.render(null);expect(ui.target.querySelector('button')).toBeNull()
 }finally{await ui.close()}
})
it('disables unavailable actions and restores trigger focus on Escape',async()=>{
 const ui=setup(),remove=vi.fn()
 try{
  await ui.render([{id:'rename',label:'重命名',icon:PencilIcon,onSelect:vi.fn()},{id:'delete',label:'删除日记',icon:Trash2Icon,destructive:true,disabled:true,onSelect:remove}])
  await ui.open()
  expect(document.querySelector('[role="menuitem"][data-disabled]')?.textContent).toBe('删除日记')
  await act(async()=>{document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(resolve=>setTimeout(resolve,30))})
  expect(document.activeElement).toBe(ui.target.querySelector('[aria-label="更多操作"]'));expect(remove).not.toHaveBeenCalled()
  await ui.render([{id:'delete',label:'删除日记',icon:Trash2Icon,disabled:true,onSelect:remove}])
  expect(ui.target.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
 }finally{await ui.close()}
})
