// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Button } from './button'
import { InputGroupButton } from './input-group'

class Observer { observe() {} unobserve() {} disconnect() {} }
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: Observer })
afterEach(() => vi.useRealTimers())

async function mount(children: React.ReactNode) {
  const host = document.createElement('div'), root = createRoot(host)
  document.body.append(host)
  await act(async () => root.render(children))
  return { host, close: async () => { await act(() => root.unmount()); host.remove() } }
}

it('shows icon help on hover and keyboard focus, dismisses with Escape and keeps the action', async () => {
  vi.useFakeTimers()
  const action = vi.fn(), ui = await mount(<Button size="icon" aria-label="日记回收站" onClick={action}><svg/></Button>)
  try {
    const button = ui.host.querySelector('button')!
    expect(button.hasAttribute('title')).toBe(false)
    await act(async () => button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true })))
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(400))
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('日记回收站')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await act(async () => button.focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('日记回收站')
    await act(async () => button.click())
    expect(action).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  } finally { await ui.close() }
})

it('explains a disabled composer icon without enabling or submitting it', async () => {
  const submit = vi.fn(), ui = await mount(<form onSubmit={e => { e.preventDefault(); submit() }}><InputGroupButton type="submit" size="icon-sm" aria-label="发送消息" disabled><svg/></InputGroupButton></form>)
  try {
    const button = ui.host.querySelector('button')!
    await act(async () => ui.host.querySelector<HTMLElement>('[tabindex="0"]')!.focus())
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('发送消息')
    await act(async () => button.click())
    expect(button.disabled).toBe(true)
    expect(submit).not.toHaveBeenCalled()
  } finally { await ui.close() }
})

it('keeps modal tooltips inside the native dialog and preserves submit-button behavior', async () => {
  const submit = vi.fn(), ui = await mount(<dialog open><form onSubmit={e => { e.preventDefault(); submit() }}><Button size="icon-sm" aria-label="执行搜索"><svg/></Button></form></dialog>)
  try {
    const button = ui.host.querySelector('button')!
    await act(async () => button.focus())
    expect(ui.host.querySelector('dialog [role="tooltip"]')?.textContent).toBe('执行搜索')
    await act(async () => button.click())
    expect(submit).toHaveBeenCalledOnce()
  } finally { await ui.close() }
})
