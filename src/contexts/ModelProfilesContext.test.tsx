// @vitest-environment jsdom
import { modelProfilesApi, type AiProfile } from '@/services/modelProfiles'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ModelProfilesProvider, useModelProfiles } from './ModelProfilesContext'

vi.mock('@/services/desktop', async (original) => ({
  ...(await original<typeof import('@/services/desktop')>()),
  desktopAvailable: true,
}))
vi.mock('@/services/modelProfiles', async (original) => ({
  ...(await original<typeof import('@/services/modelProfiles')>()),
  modelProfilesApi: { profiles: vi.fn(), preferences: vi.fn() },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('does not replace refreshed model profiles with an older response arriving later', async () => {
  let finish!: (profiles: AiProfile[]) => void
  vi.mocked(modelProfilesApi.profiles)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce([{ id: 'new', label: '新配置' } as AiProfile])
  vi.mocked(modelProfilesApi.preferences).mockResolvedValue({ defaultProfileId: null })
  function Profiles() {
    const { profiles, refresh } = useModelProfiles()
    return (
      <>
        <button onClick={() => void refresh()}>刷新配置</button>
        <p>{profiles.map((profile) => profile.label).join(',')}</p>
      </>
    )
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(() =>
      root.render(
        <ModelProfilesProvider>
          <Profiles />
        </ModelProfilesProvider>,
      ),
    )
    await act(() => host.querySelector('button')!.click())
    expect(host.textContent).toContain('新配置')
    await act(() => finish([{ id: 'old', label: '旧配置' } as AiProfile]))
    expect(host.textContent).not.toContain('旧配置')
    expect(host.textContent).toContain('新配置')
  } finally {
    await act(() => root.unmount())
  }
})
