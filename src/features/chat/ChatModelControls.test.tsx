// @vitest-environment jsdom
import { cliApi, type CliCatalog } from '@/services/cli'
import { modelProfilesApi, type AiProfile, type ModelSelection } from '@/services/modelProfiles'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ChatModelControls } from './ChatModelControls'
vi.mock('@/services/cli', async (original) => ({
  ...(await original<typeof import('@/services/cli')>()),
  cliApi: { codexCatalog: vi.fn() },
}))
vi.mock('@/services/modelProfiles', async (original) => ({
  ...(await original<typeof import('@/services/modelProfiles')>()),
  modelProfilesApi: { models: vi.fn() },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.scrollIntoView = vi.fn()
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const profile: AiProfile = {
  id: 'cli',
  label: 'Codex CLI',
  service: 'codex',
  protocol: 'codex',
  baseUrl: '',
  model: '',
  cliModelMode: 'inherit',
  contextChars: 32000,
  maxOutputTokens: 4096,
  codexPath: '/synthetic/codex',
  downstream: null,
}
const api: AiProfile = {
  ...profile,
  id: 'api',
  label: '合成 API',
  protocol: 'chat',
  model: 'first',
}
const catalog: CliCatalog = {
  currentModel: 'first',
  currentEffort: 'low',
  models: [
    {
      model: 'first',
      displayName: 'First',
      isDefault: true,
      defaultReasoningEffort: 'low',
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: '' },
        { reasoningEffort: 'high', description: '' },
      ],
    },
    {
      model: 'second',
      displayName: 'Second',
      isDefault: false,
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: '' }],
    },
  ],
}
async function setup() {
  const host = document.createElement('div'),
    root = createRoot(host),
    selected = vi.fn()
  document.body.append(host)
  function Harness() {
    const [selection, setSelection] = useState<ModelSelection>(),
      [id, setId] = useState('cli')
    return (
      <ChatModelControls
        active
        profiles={[profile, api]}
        profileId={id}
        selection={selection}
        disabled={false}
        onProfile={setId}
        onSelection={(value) => {
          selected(value)
          setSelection(value)
        }}
      />
    )
  }
  await act(async () => root.render(<Harness />))
  return {
    host,
    root,
    selected,
    open: async () =>
      act(() => host.querySelector<HTMLButtonElement>('[aria-label="聊天模型"]')!.click()),
    choose: async (id: string, model: string) =>
      act(() =>
        document
          .querySelector<HTMLElement>(`[cmdk-item][data-value='${JSON.stringify([id, model])}']`)!
          .click(),
      ),
    close: async () => {
      await act(() => root.unmount())
      host.remove()
    },
  }
}
function mocks() {
  vi.clearAllMocks()
  vi.mocked(cliApi.codexCatalog).mockResolvedValue(catalog)
  vi.mocked(modelProfilesApi.models).mockResolvedValue(['first', 'api-model'])
}
it('aggregates sources, keeps duplicate model IDs distinct and updates the model effort', async () => {
  mocks()
  const ui = await setup()
  try {
    await ui.open()
    expect(document.querySelectorAll('[cmdk-item]').length).toBe(4)
    const search = document.querySelector<HTMLInputElement>('[aria-label="搜索模型"]')!
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        search,
        'Second',
      )
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.querySelectorAll('[cmdk-item]').length).toBe(1)
    await ui.choose('cli', 'second')
    expect(ui.selected).toHaveBeenLastCalledWith({ model: 'second', reasoningEffort: 'medium' })
    expect(document.querySelector<HTMLSelectElement>('[aria-label="聊天推理强度"]')!.value).toBe(
      'medium',
    )
    expect(ui.host.querySelector('[aria-label="聊天推理强度"]')).toBeNull()
    await act(() => {
      const field = document.querySelector<HTMLSelectElement>('[aria-label="聊天推理强度"]')!
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(field, '')
      field.dispatchEvent(new Event('change', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, '')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(ui.selected).toHaveBeenLastCalledWith({ model: 'second', reasoningEffort: null })
    await ui.choose('api', 'first')
    expect(document.querySelector('[aria-label="聊天推理强度"]')).toBeNull()
    await act(() =>
      [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((node) => node.textContent === '完成')!
        .click(),
    )
    expect(document.querySelector('[aria-label="搜索模型"]')).toBeNull()
    expect(ui.host.querySelector('[aria-label="聊天模型"]')!.textContent).toContain('合成 API')
    expect(cliApi.codexCatalog).toHaveBeenCalledTimes(1)
  } finally {
    await ui.close()
  }
})
it('keeps other source models usable and retries only the failed source', async () => {
  mocks()
  vi.mocked(cliApi.codexCatalog).mockRejectedValueOnce({ message: '合成目录失败' })
  const ui = await setup()
  try {
    await ui.open()
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('合成目录失败')
    expect(document.querySelectorAll('[cmdk-item]').length).toBe(2)
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="重新读取 Codex CLI 模型"]')!.click(),
    )
    expect(modelProfilesApi.models).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('[cmdk-item]').length).toBe(4)
  } finally {
    await ui.close()
  }
})
it('ignores directories that arrive after leaving the page', async () => {
  mocks()
  let finish!: (value: CliCatalog) => void
  vi.mocked(cliApi.codexCatalog).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const ui = await setup()
  try {
    await act(() =>
      ui.root.render(
        <ChatModelControls
          active={false}
          profiles={[profile]}
          profileId="cli"
          selection={undefined}
          disabled={false}
          onProfile={() => {}}
          onSelection={() => {}}
        />,
      ),
    )
    await act(() => finish(catalog))
    expect(ui.host.textContent).not.toContain('First')
  } finally {
    await ui.close()
  }
})
