// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useChatDockWidth } from './useChatDockWidth'

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
const key='lifestory.chat-dock-width'
function Harness(){
 const panel=useChatDockWidth(true)
 return <div ref={panel.container}><div role="separator" tabIndex={0} aria-valuemin={panel.min} aria-valuemax={panel.max} aria-valuenow={panel.width} {...panel.handle}/>{panel.error&&<p role="alert">{panel.error}</p>}</div>
}
async function setup(){
 let available=1000
 const callbacks=new Set<()=>void>()
 vi.stubGlobal('ResizeObserver',class {callback:()=>void;constructor(callback:()=>void){this.callback=callback}observe(){callbacks.add(this.callback)}disconnect(){callbacks.delete(this.callback)}})
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>({width:available,height:600,left:0,right:available,top:0,bottom:600,x:0,y:0,toJSON(){}}))
 const captured=new WeakSet<Element>()
 const original=['setPointerCapture','hasPointerCapture','releasePointerCapture'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLElement.prototype,name)] as const)
 Object.assign(HTMLElement.prototype,{setPointerCapture(this:HTMLElement){captured.add(this)},hasPointerCapture(this:HTMLElement){return captured.has(this)},releasePointerCapture(this:HTMLElement){captured.delete(this)}})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(()=>root.render(<Harness/>))
 const handle=()=>host.querySelector<HTMLElement>('[role="separator"]')!
 const pointer=async(type:string,x:number,id=1)=>act(()=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x});Object.defineProperties(event,{pointerId:{value:id},isPrimary:{value:true}});handle().dispatchEvent(event)})
 return {host,width:()=>Number(handle().getAttribute('aria-valuenow')),pointer,key:async(value:string,shiftKey=false)=>act(()=>handle().dispatchEvent(new KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true}))),resize:async(value:number)=>act(()=>{available=value;callbacks.forEach(callback=>callback())}),remount:async()=>{await act(()=>root.render(null));await act(()=>root.render(<Harness/>))},close:async()=>{await act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(HTMLElement.prototype,name,descriptor);else Reflect.deleteProperty(HTMLElement.prototype,name)}localStorage.clear()}}
}
it('drags within bounds, remembers the result and restores preferred width after window resizing',async()=>{
 localStorage.clear();const ui=await setup()
 try{
  expect(ui.width()).toBe(416)
  await ui.pointer('pointerdown',700);await ui.pointer('pointermove',600);expect(ui.width()).toBe(516);expect(localStorage.getItem(key)).toBeNull()
  await ui.pointer('pointerup',600);expect(localStorage.getItem(key)).toBe('516')
  await ui.pointer('pointerdown',700);await ui.pointer('pointermove',-1000);expect(ui.width()).toBe(640);await ui.pointer('pointerup',-1000)
  await ui.remount();expect(ui.width()).toBe(640)
  await ui.resize(800);expect(ui.width()).toBe(440);expect(localStorage.getItem(key)).toBe('640')
  await ui.resize(1200);expect(ui.width()).toBe(640)
  await ui.pointer('pointerdown',700);await ui.pointer('pointermove',2000);expect(ui.width()).toBe(320);await ui.pointer('pointerup',2000)
  await ui.resize(600);expect(ui.width()).toBe(240)
 }finally{await ui.close()}
})
it('supports keyboard resizing and cancels an interrupted pointer gesture without changing memory',async()=>{
 localStorage.clear();const ui=await setup()
 try{
  await ui.key('ArrowLeft');expect(ui.width()).toBe(432);expect(localStorage.getItem(key)).toBe('432')
  await ui.pointer('pointerdown',700);await ui.pointer('pointermove',600,2);expect(ui.width()).toBe(432)
  await ui.pointer('pointermove',600);expect(ui.width()).toBe(532)
  await ui.pointer('pointercancel',600);expect(ui.width()).toBe(432);expect(localStorage.getItem(key)).toBe('432')
  await ui.key('ArrowRight',true);expect(ui.width()).toBe(368)
  await ui.key('Home');expect(ui.width()).toBe(320);await ui.key('End');expect(ui.width()).toBe(640)
 }finally{await ui.close()}
})
it('validates stored values and reports a preference write failure without losing the applied width',async()=>{
 localStorage.setItem(key,'invalid');const ui=await setup()
 try{
  expect(ui.width()).toBe(416)
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('合成存储失败')})
  await ui.key('ArrowLeft');expect(ui.width()).toBe(432);expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('未能保存')
  write.mockRestore();await ui.key('ArrowLeft');expect(localStorage.getItem(key)).toBe('448');expect(ui.host.querySelector('[role="alert"]')).toBeNull()
 }finally{await ui.close()}
})
