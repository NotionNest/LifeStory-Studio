// @vitest-environment jsdom
import { searchApi } from '@/services/search'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { GlobalCommand } from './GlobalCommand'

vi.mock('@/services/search', async (original) => ({
  ...(await original<typeof import('@/services/search')>()),
  searchApi: { query: vi.fn(), searchChats: vi.fn() },
}))
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: Observer })
Element.prototype.scrollIntoView = function () {}
const diary = {
  id: 'diary',
  title: '公园随记',
  recordDate: '2026-10-23',
  excerpt: '今天旅行的风景',
  kind: 'text' as const,
  tags: [],
  hasImages: false,
  matchField: null,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(searchApi.query).mockResolvedValue({
    items: [diary],
    nextOffset: null,
    total: 1,
    days: [],
    tags: [],
  })
  vi.mocked(searchApi.searchChats).mockResolvedValue({
    items: [
      {
        chatId: 'chat',
        title: '公园闲聊',
        messageId: 'message',
        role: 'user',
        excerpt: '旅行聊天',
      },
    ],
    nextOffset: null,
  })
})
async function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    action = vi.fn()
  await act(() => root.render(<GlobalCommand disabled={false} onAction={action} />))
  const trigger = host.querySelector('button')!
  await act(() => trigger.focus())
  const key = async (key: string, extra: KeyboardEventInit = {}) =>
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra })),
    )
  const click = async (text: string) =>
    act(() => {
      const node = [...document.querySelectorAll<HTMLElement>('[cmdk-item],button')].find((node) =>
        node.textContent?.includes(text),
      )
      expect(node).toBeTruthy()
      node!.click()
    })
  const input = async (value: string) =>
    act(() => {
      const node = document.querySelector<HTMLInputElement>('[cmdk-input]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const wait = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 240))
    })
  return {
    host,
    root,
    trigger,
    action,
    key,
    click,
    input,
    wait,
    close: async () => {
      await act(() => root.unmount())
      host.remove()
    },
  }
}
it('opens from the global shortcut, restores focus on escape and does not stack over another modal', async () => {
  const t = await setup()
  try {
    await t.key('k', { ctrlKey: true })
    expect(document.querySelector('[cmdk-input]')).toBeTruthy()
    expect(searchApi.query).not.toHaveBeenCalled()
    await t.key('Escape')
    await t.wait()
    expect(document.querySelector('[cmdk-input]')).toBeNull()
    expect(document.activeElement).toBe(t.trigger)
    const modal = document.createElement('dialog')
    modal.open = true
    document.body.append(modal)
    await t.key('k', { metaKey: true })
    expect(document.querySelector('[cmdk-input]')).toBeNull()
    modal.remove()
  } finally {
    await t.close()
  }
})
it('keeps body matches and opens the exact matching chat message after the dialog closes', async () => {
  const t = await setup()
  try {
    await act(() => t.trigger.click())
    await t.input('旅行')
    await t.wait()
    expect(document.querySelectorAll('[cmdk-item]')).toHaveLength(2)
    expect(document.querySelector('mark')?.textContent).toBe('旅行')
    expect(searchApi.query).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '旅行', dateFrom: null, tagIds: [] }),
    )
    await t.click('公园闲聊')
    expect(document.querySelector('[cmdk-input]')).toBeNull()
    await vi.waitFor(() =>
      expect(t.action).toHaveBeenCalledWith({
        kind: 'chat',
        id: 'chat',
        messageId: 'message',
        keyword: '旅行',
      }),
    )
  } finally {
    await t.close()
  }
})
it('loads each group independently and retries one failed source without losing the other', async () => {
  const t = await setup()
  try {
    vi.mocked(searchApi.searchChats).mockRejectedValueOnce({ message: '合成聊天读取失败' })
    vi.mocked(searchApi.query).mockResolvedValueOnce({
      items: [diary],
      nextOffset: 100,
      total: 101,
      days: [],
      tags: [],
    })
    await act(() => t.trigger.click())
    await t.input('旅行')
    await t.wait()
    expect(document.body.textContent).toContain('公园随记')
    expect(document.body.textContent).toContain('合成聊天读取失败')
    await t.click('重试')
    expect(document.body.textContent).toContain('公园闲聊')
    vi.mocked(searchApi.query).mockResolvedValueOnce({
      items: [{ ...diary, id: 'other', title: '另一篇' }],
      nextOffset: null,
      total: 101,
      days: [],
      tags: [],
    })
    await t.click('加载更多日记')
    expect(document.body.textContent).toContain('另一篇')
    expect(document.body.textContent).toContain('公园随记')
    expect(searchApi.query).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100 }))
  } finally {
    await t.close()
  }
})
it('ignores stale responses and waits for composition to finish', async () => {
  const t = await setup()
  try {
    let resolve!: (value: Awaited<ReturnType<typeof searchApi.query>>) => void
    vi.mocked(searchApi.query).mockImplementationOnce(() => new Promise((done) => (resolve = done)))
    await act(() => t.trigger.click())
    await t.input('旧')
    await t.wait()
    const node = document.querySelector<HTMLInputElement>('[cmdk-input]')!
    await act(() => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await t.input('新')
    await t.wait()
    expect(searchApi.query).toHaveBeenCalledTimes(1)
    await act(() => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await t.wait()
    await act(() =>
      resolve({
        items: [{ ...diary, title: '不应出现的旧结果' }],
        nextOffset: null,
        total: 1,
        days: [],
        tags: [],
      }),
    )
    expect(document.body.textContent).not.toContain('不应出现的旧结果')
    expect(searchApi.query).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '新' }))
  } finally {
    await t.close()
  }
})
it('supports keyboard execution of quick actions without searching saved content', async () => {
  const t = await setup()
  try {
    await t.key('k', { ctrlKey: true })
    await t.wait()
    expect(document.querySelector('[cmdk-item][aria-selected="true"]')?.textContent).toContain(
      '新建日记',
    )
    await act(() =>
      document
        .querySelector<HTMLInputElement>('[cmdk-input]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    await t.wait()
    expect(t.action).toHaveBeenCalledWith({ kind: 'create' })
    expect(searchApi.query).not.toHaveBeenCalled()
  } finally {
    await t.close()
  }
})
