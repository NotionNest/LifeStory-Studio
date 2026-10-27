// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppearance } from './useAppearance'

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn(async (_theme: string | null) => {}) }))
vi.mock('@/shared/runtime', () => ({ desktopAvailable: true }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setTheme }) }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
function media() {
  const listeners = new Set<() => void>()
  const query = { matches: false, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }
  vi.stubGlobal('matchMedia', () => query)
  return { query, listeners, update: async (dark: boolean) => act(() => { query.matches = dark; listeners.forEach(listener => listener()) }) }
}
function Preview() {
  const appearance = useAppearance()
  return <><select aria-label="主题" value={appearance.preference} onChange={event => appearance.change(event.target.value)}><option value="system">系统</option><option value="light">浅色</option><option value="dark">深色</option></select>{appearance.error && <p role="alert">{appearance.error}</p>}</>
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(() => root.render(<Preview/>))
  return { host, change: async (value: string) => act(() => { const select = host.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) }), close: async () => { await act(() => root.unmount()); host.remove() } }
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.documentElement.classList.remove('dark') })
it('follows system changes and removes its subscription on unmount', async () => {
  const system = media(), ui = await mount()
  expect(document.documentElement.classList.contains('dark')).toBe(false)
  await system.update(true)
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  await ui.close()
  expect(system.listeners.size).toBe(0)
})
it('persists a fixed theme across remounts and resumes following the system', async () => {
  const system = media(), ui = await mount()
  await ui.change('dark')
  await system.update(false)
  expect(document.documentElement.style.colorScheme).toBe('dark')
  await ui.close()
  const reopened = await mount()
  expect(reopened.host.querySelector('select')!.value).toBe('dark')
  await reopened.change('light')
  await system.update(true)
  expect(document.documentElement.style.colorScheme).toBe('light')
  await reopened.change('system')
  expect(document.documentElement.style.colorScheme).toBe('dark')
  expect(setTheme.mock.calls.map(([theme]) => theme)).toEqual([null, 'dark', 'dark', 'light', null])
  await reopened.close()
})
it('reports a native theme failure and clears it after another theme succeeds', async () => {
  media()
  setTheme.mockRejectedValueOnce(new Error('native appearance unavailable'))
  const ui = await mount()
  expect(ui.host.querySelector('[role="alert"]')!.textContent).toContain('窗口外观未能切换')
  await ui.change('dark')
  expect(ui.host.querySelector('[role="alert"]')).toBeNull()
  await ui.close()
})
it('reports a preference write failure while applying the chosen appearance', async () => {
  media()
  const ui = await mount()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  await ui.change('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(ui.host.querySelector('[role="alert"]')!.textContent).toContain('偏好未能保存')
  await ui.close()
})
