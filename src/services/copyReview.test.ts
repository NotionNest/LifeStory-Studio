// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { requestCopyReview } from './copyReview'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
const invokeMock = vi.mocked(invoke)
beforeEach(() => invokeMock.mockReset())

it('cancels a reservation when stopped while registration is pending', async () => {
  let finish!: () => void
  invokeMock.mockImplementation((command) =>
    command === 'copy_review_reserve'
      ? new Promise<void>((resolve) => {
          finish = resolve
        })
      : Promise.resolve(undefined),
  )
  const controller = new AbortController()
  const request = requestCopyReview(
    'diary',
    'provider',
    null,
    [{ id: 'b1', text: '合成内容' }],
    controller.signal,
  )
  controller.abort()
  finish()
  await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  expect(invokeMock.mock.calls.some(([command]) => command === 'copy_review_cancel')).toBe(true)
  expect(invokeMock.mock.calls.some(([command]) => command === 'copy_review_run')).toBe(false)
})

it('cleans up a reservation if starting the native request fails', async () => {
  invokeMock.mockImplementation((command) =>
    command === 'copy_review_run'
      ? Promise.reject(new Error('请求失败'))
      : Promise.resolve(undefined),
  )
  await expect(
    requestCopyReview(
      'diary',
      'provider',
      null,
      [{ id: 'b1', text: '合成内容' }],
      new AbortController().signal,
    ),
  ).rejects.toThrow('请求失败')
  expect(invokeMock.mock.calls.some(([command]) => command === 'copy_review_cancel')).toBe(true)
})

it('stops without waiting for a provider response once cancellation is acknowledged', async () => {
  invokeMock.mockImplementation((command) =>
    command === 'copy_review_run' ? new Promise(() => {}) : Promise.resolve(undefined),
  )
  const controller = new AbortController()
  const request = requestCopyReview(
    'diary',
    'provider',
    null,
    [{ id: 'b1', text: '合成内容' }],
    controller.signal,
  )
  await Promise.resolve()
  controller.abort()
  await expect(request).rejects.toMatchObject({ name: 'AbortError' })
})

it('reports cancellation failure rather than claiming the task stopped', async () => {
  invokeMock.mockImplementation((command) =>
    command === 'copy_review_run'
      ? new Promise(() => {})
      : command === 'copy_review_cancel'
        ? Promise.reject(new Error('取消失败'))
        : Promise.resolve(undefined),
  )
  const controller = new AbortController()
  const request = requestCopyReview(
    'diary',
    'provider',
    null,
    [{ id: 'b1', text: '合成内容' }],
    controller.signal,
  )
  await Promise.resolve()
  controller.abort()
  await expect(request).rejects.toThrow('取消失败')
})
