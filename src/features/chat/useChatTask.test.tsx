// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { chatsApi, type AiWorkspace } from '@/services/chats'
import { useChatTask } from './useChatTask'

vi.mock('@/services/chats', () => ({ chatsApi: { workspace: vi.fn() } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})
function deferred() {
  let resolve!: (value: AiWorkspace) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<AiWorkspace>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function workspace(id: string, title: string): AiWorkspace {
  return { id, title, kind: 'conversation', messages: [], sources: [], related: [], task: null }
}
async function setup(running = false) {
  const root = createRoot(document.createElement('div'))
  const setWorkspace = vi.fn(),
    setError = vi.fn()
  let refresh!: () => Promise<void>
  function Probe({ id, active }: { id: string; active: boolean }) {
    const current = useRef<string | null>(id),
      alive = useRef(true)
    useLayoutEffect(() => {
      current.current = id
    }, [id])
    refresh = useChatTask({
      current,
      alive,
      running,
      setWorkspace,
      setError,
      sessionKey: `${active}:${id}`,
    }).refresh
    return null
  }
  const render = (id: string, active = true) =>
    act(() =>
      root.render(
        <StrictMode>
          <Probe id={id} active={active} />
        </StrictMode>,
      ),
    )
  await render('a')
  return {
    render,
    refresh: () => refresh(),
    setWorkspace,
    setError,
    unmount: () => act(() => root.unmount()),
  }
}
it.each(['success', 'failure'])('ignores an older %s after a newer refresh', async (result) => {
  const older = deferred(),
    newer = deferred()
  vi.mocked(chatsApi.workspace)
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise)
  const h = await setup()
  try {
    const first = h.refresh(),
      second = h.refresh()
    newer.resolve(workspace('a', 'new'))
    await second
    if (result === 'success') older.resolve(workspace('a', 'old'))
    else older.reject(new Error('old failure'))
    await first
    expect(h.setWorkspace.mock.calls.map(([value]) => value.title)).toEqual(['new'])
    expect(h.setError).not.toHaveBeenCalled()
  } finally {
    await h.unmount()
  }
})
it.each(['success', 'failure'])('rejects an earlier visit after A → B → A: %s', async (result) => {
  const old = deferred()
  vi.mocked(chatsApi.workspace).mockReturnValueOnce(old.promise)
  const h = await setup()
  try {
    const pending = h.refresh()
    await h.render('b')
    await h.render('a')
    if (result === 'success') old.resolve(workspace('a', 'earlier visit'))
    else old.reject(new Error('earlier visit'))
    await pending
    expect(h.setWorkspace).not.toHaveBeenCalled()
    expect(h.setError).not.toHaveBeenCalled()
    vi.mocked(chatsApi.workspace).mockResolvedValueOnce(workspace('a', 'current visit'))
    await h.refresh()
    expect(h.setWorkspace).toHaveBeenCalledWith(workspace('a', 'current visit'))
  } finally {
    await h.unmount()
  }
})
it.each(['success', 'failure'])(
  'ignores %s after unmount and does not start stale refreshes',
  async (result) => {
    const old = deferred()
    vi.mocked(chatsApi.workspace).mockReturnValueOnce(old.promise)
    const h = await setup()
    const pending = h.refresh()
    await h.unmount()
    if (result === 'success') old.resolve(workspace('a', 'unmounted'))
    else old.reject(new Error('unmounted'))
    await pending
    await h.refresh()
    expect(h.setWorkspace).not.toHaveBeenCalled()
    expect(h.setError).not.toHaveBeenCalled()
    expect(chatsApi.workspace).toHaveBeenCalledTimes(1)
  },
)
it('invalidates requests when leaving and returning to the same chat', async () => {
  const old = deferred()
  vi.mocked(chatsApi.workspace).mockReturnValueOnce(old.promise)
  const h = await setup()
  try {
    const pending = h.refresh()
    await h.render('a', false)
    await h.render('a', true)
    old.resolve(workspace('a', 'before leaving'))
    await pending
    expect(h.setWorkspace).not.toHaveBeenCalled()
  } finally {
    await h.unmount()
  }
})
it('keeps polling serial, reports current errors and clears its timer', async () => {
  vi.useFakeTimers()
  const slow = deferred()
  vi.mocked(chatsApi.workspace).mockReturnValueOnce(slow.promise)
  const h = await setup(true)
  try {
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(chatsApi.workspace).toHaveBeenCalledTimes(1)
    slow.resolve(workspace('a', 'fresh'))
    await act(() => Promise.resolve())
    expect(h.setWorkspace).toHaveBeenCalledWith(workspace('a', 'fresh'))
    vi.mocked(chatsApi.workspace).mockRejectedValueOnce(new Error('current failure'))
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(h.setError).toHaveBeenCalledWith('current failure')
    await h.unmount()
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(chatsApi.workspace).toHaveBeenCalledTimes(2)
  } finally {
    await h.unmount()
  }
})
it('ignores polling errors from a departed chat', async () => {
  vi.useFakeTimers()
  const old = deferred()
  vi.mocked(chatsApi.workspace).mockReturnValueOnce(old.promise)
  const h = await setup(true)
  try {
    await act(() => vi.advanceTimersByTimeAsync(400))
    await h.render('b')
    old.reject(new Error('chat a failed'))
    await act(() => Promise.resolve())
    expect(h.setError).not.toHaveBeenCalled()
    expect(h.setWorkspace).not.toHaveBeenCalled()
  } finally {
    await h.unmount()
  }
})
it('propagates a current manual refresh failure to its operation', async () => {
  vi.mocked(chatsApi.workspace).mockRejectedValueOnce(new Error('read failed'))
  const h = await setup()
  try {
    await expect(h.refresh()).rejects.toThrow('read failed')
    expect(h.setError).not.toHaveBeenCalled()
  } finally {
    await h.unmount()
  }
})
