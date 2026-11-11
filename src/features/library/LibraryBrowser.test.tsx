// @vitest-environment jsdom
import { searchApi, type QueryPage } from '@/services/search'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { calendarDates, useLibraryQuery } from './useLibraryQuery'
import { LibraryBrowser } from './LibraryBrowser'
vi.mock('@/services/desktop', async (original) => ({
  ...(await original<typeof import('@/services/desktop')>()),
  desktopAvailable: true,
}))
vi.mock('@/services/search', async (original) => ({
  ...(await original<typeof import('@/services/search')>()),
  searchApi: { query: vi.fn(), calendar: vi.fn() },
}))
const item = {
  id: 'entry',
  title: '合成旅行记录',
  recordDate: '2026-10-20',
  excerpt: '这是一段旅行记录',
  kind: 'text' as const,
  tags: [],
  hasImages: false,
  imageIds: [],
  createdAt: 0,
  matchField: null,
}
const page: QueryPage = {
  items: [item],
  total: 1,
  nextOffset: null,
  months: [{ month: '2026-10', offset: 0 }],
  days: [],
  tags: [
    { id: 't1', name: '生活' },
    { id: 't2', name: '旅行' },
  ],
}
Element.prototype.scrollIntoView = function () {}
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: Observer })
  vi.mocked(searchApi.query).mockResolvedValue(structuredClone(page))
  vi.mocked(searchApi.calendar).mockResolvedValue({
    days: [{ date: item.recordDate, count: 5, items: [item] }],
    tags: page.tags,
  })
})
function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    open = vi.fn(),
    create = vi.fn()
  function Harness({
    active = true,
    titlebarTarget,
  }: {
    active?: boolean
    titlebarTarget?: HTMLElement
  }) {
    const browser = useLibraryQuery(active)
    return (
      <LibraryBrowser
        browser={browser}
        titlebarTarget={titlebarTarget}
        active={active}
        working={false}
        onCreate={create}
        onOpen={open}
      />
    )
  }
  const click = async (text: string, within: ParentNode = document) =>
    act(async () => {
      const button = [...within.querySelectorAll<HTMLElement>('button,[cmdk-item]')].find(
        (button) => button.textContent === text || button.getAttribute('aria-label') === text,
      )
      expect(button).toBeTruthy()
      if (button!.getAttribute('role') === 'tab')
        button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      button!.click()
    })
  const input = async (selector: string, value: string) =>
    act(() => {
      const node = document.querySelector<HTMLInputElement>(selector)!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const select = async (label: string, value: string) =>
    act(() => {
      const node = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(node, value)
      node.dispatchEvent(new Event('change', { bubbles: true }))
    })
  const escape = () =>
    act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  return {
    host,
    root,
    Harness,
    click,
    input,
    select,
    escape,
    open,
    create,
    close: async () => {
      await act(() => root.unmount())
      host.remove()
    },
  }
}
it('shows each mood in the timeline and calendar while keeping the date', async () => {
  const first = { ...item, mood: '🌸', tags: [{ id: 't1', name: '生活' }] }
  const second = { ...item, id: 'second-mood', title: '另一篇', mood: '🌧️' }
  const third = { ...item, id: 'no-mood', title: '没有心情', recordDate: '2026-10-19' }
  vi.mocked(searchApi.query).mockResolvedValue({ ...page, items: [first, second, third], total: 3 })
  vi.mocked(searchApi.calendar).mockResolvedValue({
    days: [{ date: item.recordDate, count: 2, items: [first, second] }],
    tags: [],
  })
  const t = setup()
  try {
    await act(() => t.root.render(<t.Harness />))
    const timeline = t.host.querySelector('.diary-timeline')!
    expect(
      [...timeline.querySelectorAll('.diary-timeline-day')].map((node) => node.textContent),
    ).toEqual(['20', '19'])
    expect([...timeline.querySelectorAll('[role="img"]')].map((node) => node.textContent)).toEqual([
      '🌸',
      '🌧️',
    ])
    expect(timeline.querySelector('.diary-timeline-tags')?.textContent).toBe('生活🌸')
    expect(timeline.querySelectorAll('.diary-timeline-tags')[1]?.textContent).toBe('🌧️')
    await t.click('日历')
    await t.input('[aria-label="日历月份"]', '2026-10')
    const entry = t.host.querySelector<HTMLElement>(
      '.diary-calendar-entry[data-record-id="second-mood"]',
    )!
    expect(entry.textContent).toContain('🌧️')
    await act(() => entry.click())
    expect(t.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'second-mood', mood: '🌧️' }))
  } finally {
    await t.close()
  }
})
it('places homepage controls in the titlebar and removes them when leaving', async () => {
  const t = setup()
  const target = document.createElement('div')
  document.body.append(target)
  try {
    await act(() => t.root.render(<t.Harness titlebarTarget={target} />))
    expect(target.textContent).toContain('新建日记')
    expect(target.textContent).toContain('日历')
    await t.click('日历', target)
    expect(t.host.querySelector('[aria-label="日历月份"]')).not.toBeNull()
    await t.click('新建日记', target)
    expect(t.create).toHaveBeenCalledOnce()
    await act(() => t.root.render(null))
    expect(target.textContent).toBe('')
  } finally {
    await t.close()
    target.remove()
  }
})
it('does not focus a diary on startup but restores focus after opening one', async () => {
  const t = setup()
  try {
    await act(() =>
      t.root.render(
        <StrictMode>
          <t.Harness />
        </StrictMode>,
      ),
    )
    const diary = t.host.querySelector<HTMLElement>('[data-record-id="entry"]')!
    expect(document.activeElement).not.toBe(diary)

    await t.click('合成旅行记录')
    await act(() =>
      t.root.render(
        <StrictMode>
          <t.Harness active={false} />
        </StrictMode>,
      ),
    )
    await act(() =>
      t.root.render(
        <StrictMode>
          <t.Harness />
        </StrictMode>,
      ),
    )
    expect(document.activeElement).toBe(diary)
  } finally {
    await t.close()
  }
})
it('shares filters across views and opens a day without replacing the global date range', async () => {
  const t = setup()
  try {
    await act(() => t.root.render(<t.Harness />))
    expect(t.host.querySelector('[aria-label="搜索记录"]')).toBeNull()
    await t.click('标签')
    await t.click('生活')
    await t.escape()
    await t.click('日期筛选')
    const shortcuts = document.querySelector<HTMLSelectElement>('[aria-label="快捷日期"]')!
    expect([...shortcuts.options].map((option) => option.value)).toEqual([
      'custom',
      'today',
      'yesterday',
      'weekBefore',
      'monthBefore',
    ])
    await t.select('日期条件', 'onOrAfter')
    await t.input('[aria-label="筛选日期"]', '2026-10-01')
    await t.escape()
    await t.click('日历')
    await t.input('[aria-label="日历月份"]', '2026-10')
    expect(searchApi.calendar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ keyword: '', tagIds: ['t1'], dateFrom: '2026-10-01' }),
        from: '2026-09-28',
        to: '2026-11-01',
      }),
    )
    await t.click('还有 2 篇')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: '',
        tagIds: ['t1'],
        dateFrom: '2026-10-20',
        dateTo: '2026-10-20',
      }),
    )
    await act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    await t.click('列表')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '', dateFrom: '2026-10-01', dateTo: null, month: null }),
    )
    await t.click('清除全部筛选')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '', dateFrom: null, tagIds: [] }),
    )
  } finally {
    await t.close()
  }
})
it('ignores late query results and retries failed current queries', async () => {
  const t = setup()
  try {
    let resolveOld!: (page: QueryPage) => void
    vi.mocked(searchApi.query).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    await act(() => t.root.render(<t.Harness />))
    await t.click('日期筛选')
    await t.select('日期条件', 'onOrAfter')
    vi.mocked(searchApi.query).mockResolvedValueOnce({
      ...page,
      items: [{ ...item, title: '新的命中' }],
    })
    await t.input('[aria-label="筛选日期"]', '2026-10-01')
    await t.escape()
    await act(() => resolveOld({ ...page, items: [{ ...item, title: '不应显示的旧结果' }] }))
    expect(t.host.textContent).not.toContain('不应显示的旧结果')
    vi.mocked(searchApi.query).mockRejectedValueOnce({ message: '合成查询失败' })
    await t.click('清除全部筛选')
    expect(t.host.textContent).toContain('合成查询失败')
    await t.click('重试查询')
    expect(t.host.textContent).not.toContain('合成查询失败')
  } finally {
    await t.close()
  }
})
it('retains loaded pages when returning and never renders duplicate records', async () => {
  const t = setup()
  try {
    vi.mocked(searchApi.query).mockResolvedValueOnce({ ...page, total: 2, nextOffset: 1 })
    await act(() => t.root.render(<t.Harness />))
    vi.mocked(searchApi.query).mockResolvedValueOnce({
      ...page,
      items: [item, { ...item, id: 'second', title: '第二条' }],
      total: 2,
    })
    await t.click('加载更多')
    expect(t.host.querySelectorAll('[data-record-id="entry"]')).toHaveLength(1)
    await t.click('第二条')
    expect(t.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }))
    await act(() => t.root.render(<t.Harness active={false} />))
    vi.mocked(searchApi.query)
      .mockResolvedValueOnce({ ...page, total: 2, nextOffset: 1 })
      .mockResolvedValueOnce({
        ...page,
        items: [{ ...item, id: 'second', title: '第二条更新' }],
        total: 2,
      })
    await act(() => t.root.render(<t.Harness />))
    expect(t.host.textContent).toContain('第二条更新')
    expect(searchApi.query).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }))
    expect(document.activeElement?.getAttribute('data-record-id')).toBe('second')
  } finally {
    await t.close()
  }
})
it('prefills the explicit calendar creation date without creating on day selection', async () => {
  const t = setup()
  try {
    await act(() => t.root.render(<t.Harness />))
    await t.click('日历')
    await t.input('[aria-label="日历月份"]', '2026-10')
    await t.click('查看 2026-10-20 的记录')
    expect(t.create).not.toHaveBeenCalled()
    await t.click(
      '在 2026-10-20 新建日记',
      document.querySelector('[data-slot="popover-content"]')!,
    )
    expect(t.create).toHaveBeenCalledWith('2026-10-20')
  } finally {
    await t.close()
  }
})
it('builds complete Monday-first grids across leap days and year boundaries', () => {
  expect(calendarDates('2026-10')[0]).toBe('2026-09-28')
  expect(calendarDates('2026-10').slice(-1)[0]).toBe('2026-11-01')
  expect(calendarDates('2024-02')).toContain('2024-02-29')
  expect(calendarDates('2026-01')[0]).toBe('2025-12-29')
})

it('uses a compact toolbar, searchable tag multi-selection and all/any matching', async () => {
  const t = setup()
  try {
    await act(() => t.root.render(<t.Harness />))
    expect(t.host.querySelector('h1')?.className).toContain('sr-only')
    expect(t.host.querySelector('[aria-label="图片筛选"]')).toBeNull()
    await t.click('标签')
    await t.input('[aria-label="搜索标签"]', '旅行')
    expect(document.querySelector('[data-slot="popover-content"]')?.textContent).not.toContain(
      '生活',
    )
    await t.click('旅行')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagIds: ['t2'], hasImages: null }),
    )
    await t.select('标签匹配方式', 'any')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagMode: 'any', tagIds: ['t2'] }),
    )
    await t.click('清除标签')
    expect(searchApi.query).toHaveBeenLastCalledWith(expect.objectContaining({ tagIds: [] }))
  } finally {
    await t.close()
  }
})
it('combines custom comparisons, shortcuts and ranges in one calendar popover', async () => {
  const t = setup()
  try {
    await act(() => t.root.render(<t.Harness />))
    await t.click('日期筛选')
    await t.input('[aria-label="筛选日期"]', '2026-10-23')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: '2026-10-23', dateTo: '2026-10-23' }),
    )
    await t.select('日期条件', 'before')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: null, dateTo: '2026-10-22' }),
    )
    await t.select('日期条件', 'between')
    await t.input('[aria-label="筛选结束日期"]', '2026-10-10')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      '开始日期不能晚于结束日期',
    )
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateTo: '2026-10-22' }),
    )
    await t.input('[aria-label="筛选结束日期"]', '2026-10-25')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: '2026-10-23', dateTo: '2026-10-25' }),
    )
    await t.select('日期条件', 'is')
    await t.select('快捷日期', 'today')
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: iso, dateTo: iso }),
    )
    await t.click('清除日期')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: null, dateTo: null }),
    )
  } finally {
    await t.close()
  }
})
it('recomputes relative dates on focus without disturbing tags or calendar view', async () => {
  const t = setup()
  try {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00'))
    await act(() => t.root.render(<t.Harness />))
    await t.click('日期筛选')
    await t.select('日期条件', 'relative')
    await t.select('相对日期单位', 'day')
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: '2026-10-23', dateTo: '2026-10-23' }),
    )
    await t.escape()
    await t.click('日历')
    vi.setSystemTime(new Date('2026-10-24T12:00:00'))
    await act(() => window.dispatchEvent(new Event('focus')))
    expect(searchApi.calendar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ dateFrom: '2026-10-24', dateTo: '2026-10-24' }),
      }),
    )
  } finally {
    await t.close()
    vi.useRealTimers()
  }
})
it('selects a complete date range directly on the calendar', async () => {
  const t = setup()
  try {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00'))
    await act(() => t.root.render(<t.Harness />))
    await t.click('日期筛选')
    await t.select('日期条件', 'between')
    const day = (date: string) =>
      document.querySelector<HTMLButtonElement>(
        `[data-slot="popover-content"] button[data-day="${date}"]`,
      )!
    await act(() => day('2026/10/1').click())
    await act(() => day('2026/10/16').click())
    expect(searchApi.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: '2026-10-01', dateTo: '2026-10-16' }),
    )
  } finally {
    await t.close()
    vi.useRealTimers()
  }
})
it('jumps to an older month beyond the loaded page and can load newer records', async () => {
  const t = setup()
  const older = { ...item, id: 'older', title: '过去的记录', recordDate: '2025-12-01' }
  const months = [
    { month: '2026-10', offset: 0 },
    { month: '2025-12', offset: 150 },
  ]
  vi.mocked(searchApi.query).mockImplementation(async (query) => ({
    ...page,
    months,
    total: 151,
    items: query.seekMonth === '2025-12' ? [older] : [item],
    nextOffset: query.seekMonth === '2025-12' ? null : 100,
  }))
  try {
    await act(() => t.root.render(<t.Harness />))
    await t.click('较早的年份', t.host)
    expect(t.host.textContent).toContain('过去的记录')
    expect(
      vi.mocked(searchApi.query).mock.calls.some(([query]) => query.seekMonth === '2025-12'),
    ).toBe(true)
    expect(t.host.textContent).toContain('加载较新记录')
    await t.click('加载较新记录', t.host)
    expect(t.host.textContent).toContain('记录已发生变化')
    expect(t.host.textContent).toContain('过去的记录')
  } finally {
    await t.close()
  }
})
