// @vitest-environment jsdom
import { modelProfilesApi, type AiProfile } from '@/services/modelProfiles'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AiSettings } from './AiSettings'
vi.mock('@/services/modelProfiles', async (original) => ({
  ...(await original<typeof import('@/services/modelProfiles')>()),
  modelProfilesApi: {
    configure: vi.fn(),
    updateProfile: vi.fn(),
    setDefault: vi.fn(),
    removeProfile: vi.fn(),
    models: vi.fn(),
    modelsDraft: vi.fn(),
    test: vi.fn(),
    cancelTest: vi.fn(),
  },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const saved: AiProfile = {
  id: 'saved',
  label: '合成服务',
  service: 'custom',
  protocol: 'chat',
  baseUrl: 'https://synthetic.example/v1',
  model: 'test-model',
  contextChars: 32000,
  maxOutputTokens: 4096,
  downstream: null,
  codexPath: null,
}
async function setup(profiles: AiProfile[] = []) {
  vi.clearAllMocks()
  vi.mocked(modelProfilesApi.configure).mockImplementation(async (profile) => ({
    ...profile,
    id: 'created',
  }))
  vi.mocked(modelProfilesApi.updateProfile).mockImplementation(async (profile) => ({
    ...profile,
    id: 'updated',
  }))
  vi.mocked(modelProfilesApi.setDefault).mockResolvedValue(undefined)
  vi.mocked(modelProfilesApi.removeProfile).mockResolvedValue(undefined)
  const changed = vi.fn(),
    dirty = vi.fn(),
    host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  function Harness() {
    const [items, setItems] = useState(profiles)
    return (
      <AiSettings
        active
        profiles={items}
        preferences={{ defaultProfileId: profiles[0]?.id ?? null }}
        onDirty={dirty}
        onChange={(profile) => {
          changed(profile)
          if (profile) setItems((old) => [...old.filter((item) => item.id !== profile.id), profile])
        }}
      />
    )
  }
  await act(() => root.render(<Harness />))
  const click = async (label: string) =>
    act(() => {
      const node = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.getAttribute('aria-label') === label || node.textContent === label,
      )!
      expect(node).toBeTruthy()
      if (node.getAttribute('role') === 'tab')
        node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      node.click()
    })
  const set = async (label: string, value: string) =>
    act(() => {
      const node = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[aria-label="${label}"]`,
      )!
      Object.getOwnPropertyDescriptor(
        node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
        'value',
      )!.set!.call(node, value)
      node.dispatchEvent(
        new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
      )
    })
  return {
    host,
    click,
    set,
    dirty,
    changed,
    close: async () => {
      await act(() => root.unmount())
      host.remove()
    },
  }
}
it('selects provider presets without network calls and protects a dirty form until explicit cancellation', async () => {
  const ui = await setup()
  try {
    await ui.click('阿里云百炼 / 通义')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 服务地址"]')!.value).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
    await ui.set('AI API Key', 'synthetic-secret')
    await ui.set('AI 模型 ID', 'synthetic-model')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.type).toBe(
      'password',
    )
    await ui.click('显示 API Key')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.type).toBe('text')
    const provider = [
      ...ui.host.querySelectorAll<HTMLButtonElement>('[aria-label="API 提供商预设"] button'),
    ].find((button) => button.textContent === 'OpenAI')!
    expect(provider.disabled).toBe(true)
    expect(ui.dirty).toHaveBeenLastCalledWith(true)
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    expect(modelProfilesApi.models).not.toHaveBeenCalled()
    expect(modelProfilesApi.test).not.toHaveBeenCalled()
    await ui.click('取消本次修改')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.value).toBe('')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.type).toBe(
      'password',
    )
    await ui.click('OpenAI')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 服务地址"]')!.value).toBe(
      'https://api.openai.com/v1',
    )
  } finally {
    await ui.close()
  }
})
it('keeps multiple saved configurations accessible, creates explicitly and clears the temporary key', async () => {
  const ui = await setup([
    saved,
    { ...saved, id: 'second', label: '第二配置', model: 'second-model' },
  ])
  try {
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 配置名称"]')!.value).toBe(
      '合成服务',
    )
    await ui.set('已配置服务', 'second')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 模型 ID"]')!.value).toBe(
      'second-model',
    )
    await ui.click('设为默认')
    expect(modelProfilesApi.setDefault).toHaveBeenCalledWith('second')
    await ui.set('已配置服务', 'new')
    await ui.set('AI 配置名称', '第三配置')
    await ui.set('AI 服务地址', 'https://synthetic.example/v1')
    await ui.set('AI 模型 ID', 'third-model')
    await ui.set('AI API Key', 'synthetic-not-real')
    await ui.click('保存服务配置')
    expect(modelProfilesApi.configure).toHaveBeenCalledWith(
      expect.objectContaining({ label: '第三配置', model: 'third-model', service: 'custom' }),
      'synthetic-not-real',
    )
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.value).toBe('')
    expect(ui.dirty).toHaveBeenLastCalledWith(false)
    await ui.click('停用')
    expect(modelProfilesApi.removeProfile).toHaveBeenCalledWith('created')
  } finally {
    await ui.close()
  }
})
it('reads the chosen configuration model catalog and preserves custom input after a read failure', async () => {
  const ui = await setup([saved])
  try {
    vi.mocked(modelProfilesApi.models).mockResolvedValue(['test-model', 'another-model'])
    await ui.click('读取模型目录')
    expect(modelProfilesApi.models).toHaveBeenCalledWith('saved')
    expect(ui.host.querySelector<HTMLSelectElement>('[aria-label="AI 模型"]')!.value).toBe(
      'model:test-model',
    )
    await ui.set('AI 模型', 'custom')
    await ui.set('AI 模型 ID', 'manual-model')
    await ui.click('取消本次修改')
    vi.mocked(modelProfilesApi.models).mockRejectedValueOnce({ message: '合成目录错误' })
    await ui.click('读取模型目录')
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('合成目录错误')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 模型 ID"]')!.value).toBe(
      'test-model',
    )
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    expect(modelProfilesApi.updateProfile).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
it('cancels only the explicit API test and keeps its configuration intact', async () => {
  const ui = await setup([saved])
  let reject!: (reason: unknown) => void
  try {
    vi.mocked(modelProfilesApi.test).mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    vi.mocked(modelProfilesApi.cancelTest).mockImplementation(async () => {
      reject({ message: '合成测试已取消' })
    })
    await ui.click('测试连接')
    expect(modelProfilesApi.test).toHaveBeenCalledWith('saved', expect.any(String))
    await ui.click('停止测试')
    expect(modelProfilesApi.cancelTest).toHaveBeenCalledWith(
      vi.mocked(modelProfilesApi.test).mock.calls[0][1],
    )
    expect(modelProfilesApi.test).toHaveBeenCalledTimes(1)
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('合成测试已取消')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 配置名称"]')!.value).toBe(
      '合成服务',
    )
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    expect(modelProfilesApi.removeProfile).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})

it('loads draft model choices before saving and supports an explicit custom ID', async () => {
  const ui = await setup()
  let finish!: (models: string[]) => void
  try {
    await ui.click('DeepSeek')
    await ui.set('AI API Key', 'synthetic-not-real')
    vi.mocked(modelProfilesApi.modelsDraft).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await ui.click('读取模型目录')
    expect(modelProfilesApi.modelsDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'deepseek',
        model: '',
        baseUrl: 'https://api.deepseek.com',
      }),
      'synthetic-not-real',
    )
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 配置名称"]')!.disabled).toBe(
      false,
    )
    await act(() => finish(['synthetic-chat', 'synthetic-reasoner']))
    await ui.set('AI 模型', 'model:synthetic-chat')
    expect(ui.host.querySelector('[aria-label="AI 模型 ID"]')).toBeNull()
    await ui.set('AI 模型', 'custom')
    await ui.set('AI 模型 ID', 'custom-deployment')
    await ui.click('保存服务配置')
    expect(modelProfilesApi.configure).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-deployment' }),
      'synthetic-not-real',
    )
  } finally {
    await ui.close()
  }
})
it('ignores stale catalog results after changing the address and never reuses a saved key for a new host', async () => {
  const ui = await setup([saved])
  let finish!: (models: string[]) => void
  try {
    vi.mocked(modelProfilesApi.models).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await ui.click('读取模型目录')
    await ui.set('AI 服务地址', 'https://changed.synthetic.example/v1')
    await act(() => finish(['stale-model']))
    expect(ui.host.querySelector('[aria-label="AI 模型"]')!.textContent).not.toContain(
      'stale-model',
    )
    expect(
      [...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.textContent === '读取模型目录',
      )!.disabled,
    ).toBe(true)
    expect(modelProfilesApi.modelsDraft).not.toHaveBeenCalled()
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 模型 ID"]')!.value).toBe(
      'test-model',
    )
  } finally {
    await ui.close()
  }
})
