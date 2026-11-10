// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { attachmentsApi } from '@/services/attachments'
import { TimelineImages } from './TimelineImages'

it('loads visible record images, retries failures and releases the object URL', async () => {
  let intersect: IntersectionObserverCallback = () => {}
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      intersect = callback
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = vi.fn()
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const read = vi
    .spyOn(attachmentsApi, 'image')
    .mockRejectedValueOnce(new Error('图片读取失败'))
    .mockResolvedValue(new ArrayBuffer(1))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    const openRecord = vi.fn()
    await act(() =>
      root.render(
        <div onClick={openRecord}>
          <TimelineImages recordId="diary" ids={['image']} />
        </div>,
      ),
    )
    expect(read).not.toHaveBeenCalled()
    await act(async () => {
      intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      await Promise.resolve()
    })
    expect(host.textContent).toContain('重试图片')
    await act(async () => {
      host.querySelector('button')!.click()
      await Promise.resolve()
    })
    expect(read).toHaveBeenLastCalledWith('diary', 'image')
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:synthetic')
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="预览图片"]')!.click()
      await Promise.resolve()
    })
    expect(host.querySelector('dialog[aria-label="原图预览"]')).not.toBeNull()
    expect(openRecord).not.toHaveBeenCalled()
    await act(() =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '关闭图片')!
        .click(),
    )
    expect(host.querySelector('dialog')).toBeNull()
    const readsBeforeLeaving = read.mock.calls.length
    await act(async () => {
      intersect(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
    expect(host.querySelector('img')).toBeNull()
    await act(async () => {
      intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      await Promise.resolve()
    })
    expect(read).toHaveBeenCalledTimes(readsBeforeLeaving + 1)
    expect(host.querySelector('img')).not.toBeNull()
    await act(() => root.unmount())
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  } finally {
    host.remove()
    create.mockRestore()
    revoke.mockRestore()
    read.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('does not create a thumbnail after it leaves the viewport during loading', async () => {
  let intersect: IntersectionObserverCallback = () => {}
  let resolveImage: (value: ArrayBuffer) => void = () => {}
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      intersect = callback
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const read = vi.spyOn(attachmentsApi, 'image').mockReturnValue(
    new Promise((resolve) => {
      resolveImage = resolve
    }),
  )
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(() => root.render(<TimelineImages recordId="diary" ids={['image']} />))
    await act(() =>
      intersect(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    await act(() =>
      intersect(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    await act(async () => {
      resolveImage(new ArrayBuffer(1))
      await Promise.resolve()
    })
    expect(create).not.toHaveBeenCalled()
    expect(host.querySelector('img')).toBeNull()
  } finally {
    await act(() => root.unmount())
    host.remove()
    create.mockRestore()
    read.mockRestore()
    vi.unstubAllGlobals()
  }
})
