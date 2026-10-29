// @vitest-environment jsdom
import { trashApi, type TrashItem } from '@/services/trash'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { it, expect, vi } from 'vitest'
import { TrashPanel } from './TrashPanel'
vi.mock('@/services/trash', async (original) => ({
  ...(await original<typeof import('@/services/trash')>()),
  trashApi: {
    trashStatus: vi.fn().mockResolvedValue('active'),
    trashList: vi.fn(),
    trashMove: vi.fn(),
    trashImpact: vi.fn(),
    trashRestore: vi.fn(),
    trashPurge: vi.fn(),
  },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
HTMLDialogElement.prototype.showModal = function () {
  this.open = true
}
const item: TrashItem = {
  id: 'trash',
  title: '合成删除记录',
  kind: 'text',
  recordDate: '2026-10-21',
  deletedAt: 1000,
  purgeAt: 2592001000,
}
function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  return {
    host,
    root,
    click: (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent === label)!
        .click(),
    end: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}
it('requires a second explicit confirmation, keeps cleanup failures visible and retries', async () => {
  vi.clearAllMocks()
  vi.mocked(trashApi.trashList).mockResolvedValue({
    items: [item],
    nextOffset: null,
    cleanupError: null,
  })
  vi.mocked(trashApi.trashPurge).mockRejectedValue({ message: '记录已清除，图片待清理' })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<TrashPanel />))
    await act(async () => ui.click('彻底删除…'))
    expect(trashApi.trashPurge).not.toHaveBeenCalled()
    expect(
      [...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === '确认彻底删除',
      )!.disabled,
    ).toBe(true)
    await act(async () => ui.click('取消彻底删除'))
    expect(ui.host.querySelector('[role=alertdialog]')).toBeNull()
    await act(async () => ui.click('彻底删除…'))
    await act(async () => ui.host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
    await act(async () => ui.click('确认彻底删除'))
    expect(trashApi.trashPurge).toHaveBeenCalledWith(item)
    expect(ui.host.querySelector('[role=alert]')!.textContent).toContain('图片待清理')
    vi.mocked(trashApi.trashList).mockResolvedValue({
      items: [],
      nextOffset: null,
      cleanupError: null,
    })
    await act(async () => ui.click('刷新并重试清理'))
    expect(ui.host.textContent).toContain('回收站为空')
  } finally {
    await ui.end()
  }
})
it('restores records and leaves failed restore actionable', async () => {
  vi.clearAllMocks()
  vi.mocked(trashApi.trashList).mockResolvedValue({
    items: [item],
    nextOffset: null,
    cleanupError: null,
  })
  vi.mocked(trashApi.trashRestore)
    .mockRejectedValueOnce({ message: '合成恢复失败' })
    .mockResolvedValue(undefined)
  const ui = setup()
  try {
    await act(async () => ui.root.render(<TrashPanel />))
    await act(async () => ui.click('恢复记录'))
    expect(ui.host.textContent).toContain('合成恢复失败')
    vi.mocked(trashApi.trashList).mockResolvedValue({
      items: [],
      nextOffset: null,
      cleanupError: null,
    })
    await act(async () => ui.click('恢复记录'))
    expect(trashApi.trashRestore).toHaveBeenLastCalledWith(item)
    expect(ui.host.textContent).toContain('记录已恢复')
  } finally {
    await ui.end()
  }
})
