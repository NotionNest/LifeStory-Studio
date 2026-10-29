// @vitest-environment jsdom
import { recordsApi, type RecordFile, type SaveResult } from '@/services/records'
import { tagsApi } from '@/services/tags'
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordEditor, type EditorHandle } from './RecordEditor'
vi.mock('@/services/records', async (original) => ({
  ...(await original<typeof import('@/services/records')>()),
  recordsApi: { save: vi.fn(), end: vi.fn().mockResolvedValue(undefined), export: vi.fn() },
}))
vi.mock('@/services/tags', async (original) => ({
  ...(await original<typeof import('@/services/tags')>()),
  tagsApi: { tag: vi.fn(), tagCatalog: vi.fn().mockResolvedValue([]) },
}))
const record: RecordFile = {
  id: 'entry',
  title: null,
  recordDate: '2026-10-15',
  createdTimezone: 'Asia/Shanghai',
  createdAt: 0,
  updatedAt: 0,
  contentVersion: 0,
  checkpointId: 'revision-one',
  document: { type: 'doc', content: [{ type: 'paragraph' }] },
  tags: [],
}
let root: Root, host: HTMLDivElement
const dirty = vi.fn()
const ref = createRef<EditorHandle>()
function title(value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function result(): SaveResult {
  return {
    recordId: 'entry',
    contentVersion: 1,
    checkpointId: 'revision-two',
    requestId: 'request',
    sessionId: 'session',
    editSequence: 1,
    savedAt: 1,
  }
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(recordsApi.save).mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <RecordEditor
        ref={ref}
        record={record}
        sessionId="session"
        onDirty={dirty}
        onBusy={() => {}}
        onSaved={() => {}}
        onFailure={() => {}}
      />,
    )
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})
describe('record saving user state', () => {
  it('retains edits on failure and retries the identical uncertain request', async () => {
    vi.mocked(recordsApi.save)
      .mockRejectedValueOnce({ code: 'write_failed', message: '合成写入失败' })
      .mockResolvedValueOnce(result())
    await act(async () => title('保留这段内容'))
    let success = true
    await act(async () => {
      success = await ref.current!.save()
    })
    expect(success).toBe(false)
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe(
      '保留这段内容',
    )
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('合成写入失败')
    await act(async () => {
      success = await ref.current!.save()
    })
    expect(success).toBe(true)
    expect(vi.mocked(recordsApi.save).mock.calls[0][0]).toEqual(
      vi.mocked(recordsApi.save).mock.calls[1][0],
    )
  })
  it('does not mark newer edits saved when an older response arrives', async () => {
    let resolve!: (value: SaveResult) => void
    vi.mocked(recordsApi.save)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
      .mockResolvedValueOnce({ ...result(), contentVersion: 0, checkpointId: 'revision-three' })
    await act(async () => title('第一稿'))
    let saving!: Promise<boolean>
    await act(async () => {
      saving = ref.current!.save()
    })
    await act(async () => title('保存期间继续写'))
    let clean = true
    await act(async () => {
      resolve(result())
      clean = await saving
    })
    expect(clean).toBe(false)
    expect(dirty).toHaveBeenLastCalledWith(true)
    expect(host.querySelector('[role="status"]')!.textContent).toContain('新修改')
    await act(async () => {
      await ref.current!.save()
    })
    expect(vi.mocked(recordsApi.save).mock.calls[1][0]).toMatchObject({
      baseContentVersion: 1,
      baseCheckpointId: 'revision-two',
      title: '保存期间继续写',
    })
  })
  it('uses one automatic persistence pipeline without a separate recovery write', async () => {
    vi.mocked(recordsApi.save).mockResolvedValue(result())
    await act(async () => title('自动保存内容'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="status"]')!.textContent).toBe('已保存到本机')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === '保存')).toBe(false)
  })
  it('persists within two seconds during continuous input', async () => {
    vi.mocked(recordsApi.save).mockResolvedValue(result())
    await act(async () => title('开始'))
    for (let i = 0; i < 9; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
        title(`连续输入${i}`)
      })
    }
    expect(recordsApi.save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordsApi.save).mock.calls[0][0].title).toBe('连续输入8')
  })
  it('automatically retries transient failures using the same uncertain request', async () => {
    vi.mocked(recordsApi.save)
      .mockRejectedValueOnce({ code: 'storage_busy', message: '合成失败' })
      .mockResolvedValueOnce(result())
    await act(async () => title('失败仍保留'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('自动重试')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(2)
    expect(vi.mocked(recordsApi.save).mock.calls[0][0]).toEqual(
      vi.mocked(recordsApi.save).mock.calls[1][0],
    )
    expect(dirty).toHaveBeenLastCalledWith(false)
  })
  it('keeps conflicts paused when input changes, without automatic overwrites', async () => {
    vi.mocked(recordsApi.save).mockRejectedValue({ code: 'conflict', message: '会话已变化' })
    await act(async () => title('不能覆盖'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    await act(async () => title('仍保留在编辑器'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(1)
    expect(dirty).toHaveBeenLastCalledWith(true)
  })
  it('does not let continuing input bypass the retry delay', async () => {
    vi.mocked(recordsApi.save).mockRejectedValue({ code: 'storage_busy', message: '暂忙' })
    await act(async () => title('第一稿'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    for (let i = 0; i < 4; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
        title(`继续${i}`)
      })
    expect(recordsApi.save).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(2)
  })
  it('does not automatically retry permission failures even after more editing', async () => {
    vi.mocked(recordsApi.save).mockRejectedValue({ code: 'storage_permission', message: '不可写' })
    await act(async () => title('保留'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    await act(async () => title('继续保留'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(1)
  })
  it('flushes newer input after an older in-flight save without treating it as failure', async () => {
    let resolve!: (value: SaveResult) => void
    vi.mocked(recordsApi.save)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      )
      .mockResolvedValueOnce({ ...result(), contentVersion: 2 })
    await act(async () => title('A'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    await act(async () => title('AB'))
    let flushing!: Promise<'saved' | 'failed'>
    await act(async () => {
      flushing = ref.current!.flush()
    })
    let flushed = ''
    await act(async () => {
      resolve(result())
      flushed = await flushing
    })
    expect(flushed).toBe('saved')
    expect(recordsApi.save).toHaveBeenCalledTimes(2)
    expect(vi.mocked(recordsApi.save).mock.calls[1][0]).toMatchObject({
      title: 'AB',
      baseContentVersion: 1,
    })
    expect(dirty).toHaveBeenLastCalledWith(false)
  })
  it('does not persist half-composed input, then resumes after composition ends', async () => {
    vi.mocked(recordsApi.save).mockResolvedValue(result())
    const body = host.querySelector('[aria-label="记录标题"]')!
    await act(async () => {
      body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      title('组合输入期间')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(recordsApi.save).not.toHaveBeenCalled()
    await act(async () => {
      body.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    expect(recordsApi.save).toHaveBeenCalledTimes(1)
  })
})
it('retries at its deadline while continuous typing proceeds and preserves request identity', async () => {
  vi.mocked(recordsApi.save)
    .mockRejectedValueOnce({ code: 'storage_busy', message: '暂忙' })
    .mockResolvedValue(result())
  await act(async () => title('原请求'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })
  for (let i = 0; i < 10; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      title(`持续输入${i}`)
    })
  expect(recordsApi.save).toHaveBeenCalledTimes(2)
  expect(vi.mocked(recordsApi.save).mock.calls[1][0]).toEqual(
    vi.mocked(recordsApi.save).mock.calls[0][0],
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })
  expect(vi.mocked(recordsApi.save).mock.calls[2][0]).toMatchObject({
    title: '持续输入9',
    baseContentVersion: 1,
  })
})
it('keeps an overdue retry through composition and resumes without another backoff', async () => {
  vi.mocked(recordsApi.save)
    .mockRejectedValueOnce({ code: 'storage_busy', message: '暂忙' })
    .mockResolvedValue(result())
  await act(async () => title('原请求'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })
  const input = host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
  await act(async () => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    title('候选')
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500)
  })
  expect(recordsApi.save).toHaveBeenCalledTimes(1)
  await act(async () => {
    title('最终文字')
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(20)
  })
  expect(recordsApi.save).toHaveBeenCalledTimes(2)
})
it('finishes composition before locking all editing and flushing on leave', async () => {
  vi.mocked(recordsApi.save).mockResolvedValue(result())
  const input = host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
  await act(async () => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    title('候选')
  })
  let leave!: Promise<'saved' | 'failed'>
  await act(async () => {
    leave = ref.current!.prepareLeave()
  })
  expect(input.readOnly).toBe(false)
  expect(recordsApi.save).not.toHaveBeenCalled()
  await act(async () => {
    title('最终文字')
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(20)
  })
  expect(await leave).toBe('saved')
  expect(input.readOnly).toBe(true)
  expect(host.querySelector('[aria-label="记录正文"]')!.getAttribute('contenteditable')).toBe(
    'false',
  )
  expect(vi.mocked(recordsApi.save).mock.calls[0][0].title).toBe('最终文字')
  await act(async () => {
    ref.current!.resume()
  })
  expect(input.readOnly).toBe(false)
})

it('uses the shared calendar for fixed record dates and keeps tag manager selection in the save pipeline', async () => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
  vi.mocked(recordsApi.save).mockResolvedValue(result())
  vi.mocked(tagsApi.tag).mockResolvedValue({ id: 'life', name: '生活' })
  try {
    expect(host.querySelector('[aria-label="管理标签"]')).not.toBeNull()
    await act(() => host.querySelector<HTMLButtonElement>('button[aria-label="记录日期"]')!.click())
    expect(document.querySelector('[data-slot="calendar"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="日期条件"]')).toBeNull()
    expect(document.querySelector('[aria-label="快捷日期"]')).toBeNull()
    const selectedDay = new Date('2026-10-20T12:00:00').toLocaleDateString('zh-CN')
    await act(() =>
      document.querySelector<HTMLButtonElement>(`button[data-day="${selectedDay}"]`)!.click(),
    )
    await act(() => ref.current!.save())
    expect(recordsApi.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordDate: '2026-10-20' }),
    )
    await act(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button')]
        .find((button) => button.textContent === '清除日期')!
        .click(),
    )
    await act(() => ref.current!.prepareLeave())
    expect(recordsApi.save).toHaveBeenLastCalledWith(expect.objectContaining({ recordDate: '' }))
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="记录日期"]')!.disabled).toBe(
      true,
    )
    await act(() => {
      ref.current!.resume()
    })
    await act(() => host.querySelector<HTMLButtonElement>('[aria-label="管理标签"]')!.click())
    const input = document.querySelector<HTMLInputElement>('[aria-label="搜索或创建标签"]')!
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '生活')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find((button) => button.textContent === '创建“生活”')!
        .click(),
    )
    await act(() => ref.current!.save())
    expect(recordsApi.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ recordDate: '', tagIds: ['life'] }),
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
