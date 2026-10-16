// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LibraryWorkspace } from './LibraryWorkspace'
import { libraryApi } from './api'
vi.mock('@/shared/runtime', () => ({ desktopAvailable: true }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), libraryApi: { list: vi.fn(), read: vi.fn(), create: vi.fn(), save: vi.fn(), tag: vi.fn(), exit: vi.fn(), export: vi.fn() } }))
it('guards navigation on failure and discards only after explicit choice, even reopening the same entry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const record = { id: 'entry', title: '原始标题', recordDate: '2026-10-15', createdTimezone: 'Asia/Shanghai', createdAt: 0, updatedAt: 0, revisionId: 'version', document: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] }
  vi.mocked(libraryApi.list).mockResolvedValue([{ id: 'entry', title: record.title, recordDate: record.recordDate, excerpt: '' }])
  vi.mocked(libraryApi.read).mockResolvedValue(record)
  vi.mocked(libraryApi.save).mockRejectedValue({ code: 'write_failed', message: '合成保存失败' })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const click = (text: string, within: ParentNode = host) => { const button = [...within.querySelectorAll('button')].find(b => b.textContent === text)!; expect(button).toBeTruthy(); button.click() }
  try {
    await act(async () => { root.render(<LibraryWorkspace />) })
    await act(async () => { host.querySelector<HTMLButtonElement>('aside button[aria-current]')?.click(); [...host.querySelectorAll<HTMLButtonElement>('aside button')].find(b => b.textContent?.includes('原始标题'))!.click() })
    const input = () => host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), '未保存标题'); input().dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => click('新建记录'))
    expect(libraryApi.create).not.toHaveBeenCalled()
    await act(async () => click('保存并继续', host.querySelector('dialog')!))
    expect(host.querySelector('dialog [role="alert"]')!.textContent).toContain('合成保存失败')
    expect(input().value).toBe('未保存标题')
    await act(async () => click('继续编辑'))
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('aside button')].find(b => b.textContent?.includes('原始标题'))!.click() })
    await act(async () => click('放弃修改并继续'))
    expect(input().value).toBe('原始标题')
  } finally { await act(async () => root.unmount()); host.remove() }
})
