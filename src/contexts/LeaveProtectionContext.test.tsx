// @vitest-environment jsdom
import { StrictMode, Suspense, act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { expect, it } from 'vitest'
import { LeaveProtectionProvider, useLeaveStatus } from './LeaveProtectionContext'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('keeps other operations protected when one owner unmounts and ignores callbacks from that removed owner', async () => {
  let lateBusy: (value: boolean) => void = () => {}
  let lateDraft: (value: boolean) => void = () => {}
  function Operation({ name }: { name: string }) {
    const status = useLeaveStatus()
    status.setBusy(true)
    if (name === 'first') {
      lateBusy = status.setBusy
      lateDraft = status.setDraft
    }
    return <p>{name}</p>
  }
  function Operations() {
    const [first, setFirst] = useState(true)
    const [second, setSecond] = useState(true)
    return (
      <>
        <button onClick={() => setFirst(false)}>移除第一个操作</button>
        <button onClick={() => setSecond(false)}>移除第二个操作</button>
        {first && <Operation name="first" />}
        {second && <Operation name="second" />}
      </>
    )
  }
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <LeaveProtectionProvider>
          <Operations />
        </LeaveProtectionProvider>
      ),
    },
  ])
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const blocked = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    await act(() =>
      root.render(
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>,
      ),
    )
    expect(blocked()).toBe(true)
    await act(() => host.querySelectorAll('button')[0].click())
    lateBusy(false)
    expect(blocked()).toBe(true)
    await act(() => host.querySelectorAll('button')[1].click())
    expect(blocked()).toBe(false)
    lateBusy(true)
    lateDraft(true)
    expect(blocked()).toBe(false)
  } finally {
    await act(() => root.unmount())
    router.dispose()
    host.remove()
  }
})

it.each(['setBusy', 'setDraft'] as const)(
  'does not retain %s protection from a suspended render that never committed',
  async (setStatus) => {
    const pending = new Promise<never>(() => {})
    function UncommittedOperation(): never {
      const status = useLeaveStatus()
      status[setStatus](true)
      throw pending
    }
    function CommittedOperation() {
      const status = useLeaveStatus()
      return (
        <button
          onClick={() => {
            status.setBusy(true)
            const event = new Event('beforeunload', { cancelable: true })
            window.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(true)
            status.setBusy(false)
          }}
        >
          开始操作
        </button>
      )
    }
    function Content() {
      const [show, setShow] = useState(true)
      return (
        <>
          <button onClick={() => setShow(false)}>放弃未提交视图</button>
          <CommittedOperation />
          {show && (
            <Suspense fallback={<p>等待</p>}>
              <UncommittedOperation />
            </Suspense>
          )}
        </>
      )
    }
    const router = createMemoryRouter([
      {
        path: '*',
        element: (
          <LeaveProtectionProvider>
            <Content />
          </LeaveProtectionProvider>
        ),
      },
    ])
    const host = document.createElement('div')
    const root = createRoot(host)
    try {
      await act(() =>
        root.render(
          <StrictMode>
            <RouterProvider router={router} />
          </StrictMode>,
        ),
      )
      await act(() => host.querySelector('button')!.click())
      expect(host.textContent).not.toContain('等待')
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      await act(() => host.querySelectorAll('button')[1].click())
    } finally {
      await act(() => root.unmount())
      router.dispose()
    }
  },
)
