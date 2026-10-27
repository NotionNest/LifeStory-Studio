// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import App from './App'
import { libraryApi } from '@/features/library/api'
import { aiApi } from '@/features/library/aiApi'

vi.mock('@/shared/runtime', () => ({ desktopAvailable: false }))
vi.mock('@/features/library/aiApi', async original => ({ ...await original<typeof import('@/features/library/aiApi')>(), aiApi: { models: vi.fn().mockResolvedValue([]), scanCli: vi.fn().mockResolvedValue([]), chats: vi.fn().mockResolvedValue({ items: [], nextOffset: null }), send: vi.fn() } }))
vi.mock('@/features/library/api',async original=>({...await original<typeof import('@/features/library/api')>(),libraryApi:{...((await original<typeof import('@/features/library/api')>()).libraryApi),trashList:vi.fn().mockResolvedValue({items:[],nextOffset:null,cleanupError:null})}}))
class Observer { observe() {} unobserve() {} disconnect() {} }
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: Observer, IntersectionObserver: Observer })
Element.prototype.scrollTo = function () {}
HTMLDialogElement.prototype.showModal = function () { this.open = true }

async function setup() {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const host = document.createElement('div'), root = createRoot(host)
  document.body.append(host)
  await act(async () => root.render(<App/>))
  const click = async (label: string, selector = 'button') => act(async () => {
    const button = [...host.querySelectorAll<HTMLButtonElement>(selector)].find(element => element.getAttribute('aria-label') === label || element.textContent === label)
    expect(button).toBeTruthy()
    if (button!.getAttribute('role') === 'tab') button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    button!.click()
  })
  const set = async (label: string, value: string) => act(() => {
    const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return { host, click, set, close: async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() } }
}
it('keeps an API settings draft while switching settings categories and collapsing the sidebar', async () => {
  const ui = await setup()
  try {
    await ui.click('设置')
    expect(ui.host.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label')).toBe('设置')
    await ui.click('模型与提供商', 'aside button')
    await ui.click('API 提供商', '[role="tab"]')
    await ui.set('AI 配置名称', '尚未保存的合成配置')
    await ui.click('外观', 'aside button')
    await ui.click('收起侧栏')
    expect(ui.host.querySelector<HTMLElement>('#settings-sidebar')!.hidden).toBe(true)
    await ui.click('展开侧栏')
    await ui.click('模型与提供商', 'aside button')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 配置名称"]')!.value).toBe('尚未保存的合成配置')
  } finally { await ui.close() }
})
it('keeps unsent chat text across settings navigation and sidebar changes', async () => {
  const ui = await setup()
  try {
    await ui.click('聊天')
    await ui.set('聊天输入', '合成讲述：今天在公园散步。')
    await ui.click('设置')
    await ui.click('收起侧栏')
    await ui.click('返回主界面')
    expect(ui.host.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label')).toBe('聊天')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe('合成讲述：今天在公园散步。')
    expect(aiApi.send).not.toHaveBeenCalled()
  } finally { await ui.close() }
})

it('shows the sidebar control only where a module sidebar exists and returns to the diary home',async()=>{
 const ui=await setup()
 try{
  expect(ui.host.querySelector('header [aria-controls="diary-sidebar"]')).toBeNull()
  await ui.click('聊天');expect(ui.host.querySelector('header [aria-controls="chat-sidebar"]')).not.toBeNull()
  await ui.click('日记');expect(ui.host.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label')).toBe('日记');expect(ui.host.querySelector('header [aria-controls="diary-sidebar"]')).toBeNull()
 }finally{await ui.close()}
})

it('opens trash as a settings page with diary and chat categories and preserves a chat draft',async()=>{
 const ui=await setup();vi.mocked(libraryApi.trashList).mockClear()
 try{
  expect(ui.host.querySelector('nav [aria-label="回收站"]')).toBeNull()
  await ui.click('聊天');await ui.set('聊天输入','回收站检查的未发送草稿')
  await ui.click('设置');await ui.click('回收站','aside button')
  expect(ui.host.querySelector('#trash-heading')?.textContent).toBe('回收站')
  expect(ui.host.querySelector('dialog')).toBeNull()
  expect(libraryApi.trashList).toHaveBeenLastCalledWith(0,'diary')
  await ui.click('聊天','[aria-label="回收站分类"] button')
  expect(libraryApi.trashList).toHaveBeenLastCalledWith(0,'chat')
  expect(libraryApi.trashList).toHaveBeenCalledTimes(2)
  await ui.click('收起侧栏');await ui.click('外观','[aria-label="设置页面"] button');await ui.click('回收站','[aria-label="设置页面"] button')
  expect(ui.host.querySelector('[aria-label="聊天回收站"]')).not.toBeNull()
  await ui.click('返回主界面')
  expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe('回收站检查的未发送草稿')
 }finally{await ui.close()}
})

it('keeps settings categories, API settings and navigation available during CLI scanning',async()=>{
 let finish!:(items:[])=>void
 vi.mocked(aiApi.scanCli).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const ui=await setup()
 try{
  await ui.click('设置')
  await ui.click('模型与提供商','aside button')
  const scan=[...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent==='扫描本机 CLI')!
  expect(scan.disabled).toBe(true)
  await ui.click('API 提供商','[role="tab"]')
  expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 配置名称"]')!.disabled).toBe(false)
  await ui.click('外观','aside button')
  await ui.click('回收站','aside button')
  expect(ui.host.querySelector('[aria-labelledby="trash-heading"]')).toBeTruthy()
  const back=ui.host.querySelector<HTMLButtonElement>('[aria-label="返回主界面"]')!
  expect(back.disabled).toBe(false)
  await ui.click('聊天')
  expect(ui.host.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label')).toBe('聊天')
  await act(async()=>finish([]))
 }finally{await act(async()=>finish([]));await ui.close()}
})
