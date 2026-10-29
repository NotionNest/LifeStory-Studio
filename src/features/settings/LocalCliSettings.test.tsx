// @vitest-environment jsdom
import { cliApi, type CliCatalog } from '@/services/cli'
import { modelProfilesApi, type AiProfile } from '@/services/modelProfiles'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LocalCliSettings } from './LocalCliSettings'
vi.mock('@/services/cli', async (original) => ({
  ...(await original<typeof import('@/services/cli')>()),
  cliApi: {
    testCli: vi.fn(),
    codexProbe: vi.fn(),
    scanCli: vi.fn(),
    codexCatalog: vi.fn(),
    inspectCodex: vi.fn(),
  },
}))
vi.mock('@/services/modelProfiles', async (original) => ({
  ...(await original<typeof import('@/services/modelProfiles')>()),
  modelProfilesApi: {
    configure: vi.fn(),
    updateProfile: vi.fn(),
    setDefault: vi.fn(),
    test: vi.fn(),
    cancelTest: vi.fn(),
    removeProfile: vi.fn(),
  },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const installation = {
  kind: 'codex',
  name: 'Codex CLI',
  path: '/synthetic/codex',
  version: 'codex-cli 0.146.0',
  error: null,
}
const catalog: CliCatalog = {
  currentModel: 'first',
  currentEffort: 'medium',
  models: [
    {
      model: 'first',
      displayName: '第一模型',
      supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: '均衡' }],
      defaultReasoningEffort: 'medium',
      isDefault: false,
    },
    {
      model: 'second',
      displayName: '第二模型',
      supportedReasoningEfforts: [{ reasoningEffort: 'high', description: '更多推理' }],
      defaultReasoningEffort: 'high',
      isDefault: true,
    },
  ],
}
const profile: AiProfile = {
  id: 'saved',
  label: '我的 Codex',
  service: 'codex',
  protocol: 'codex',
  baseUrl: '',
  model: '',
  cliModelMode: 'inherit',
  reasoningEffort: null,
  codexPath: installation.path,
  contextChars: 32000,
  maxOutputTokens: 4096,
  downstream: null,
}
function setup() {
  vi.clearAllMocks()
  vi.mocked(cliApi.scanCli).mockResolvedValue([installation])
  vi.mocked(cliApi.codexCatalog).mockResolvedValue(catalog)
  vi.mocked(modelProfilesApi.configure).mockImplementation(async (p) => ({ ...p, id: 'saved' }))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  return {
    host,
    root,
    click: (label: string) => {
      const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent === label || b.getAttribute('aria-label') === label,
      )
      expect(button).toBeTruthy()
      button!.click()
    },
    set: (label: string, value: string) => {
      const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[aria-label="${label}"]`,
      )!
      const proto =
        el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    },
    end: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}
const callbacks = { onChange: vi.fn(), onDirty: vi.fn(), onBusy: vi.fn() }
it('scans installations then loads CLI models only when its accordion opens', async () => {
  const ui = setup()
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    expect(cliApi.scanCli).toHaveBeenCalledTimes(1)
    expect(cliApi.codexCatalog).not.toHaveBeenCalled()
    await act(async () => ui.click('配置 Codex CLI'))
    expect(cliApi.codexCatalog).toHaveBeenCalledWith(installation.path)
    const options = Array.from(
      ui.host.querySelectorAll<HTMLSelectElement>('[aria-label="CLI 模型"] option'),
    ).map((o) => o.textContent)
    expect(options.join()).toContain('跟随 CLI 设置（当前 first）')
    expect(options.join()).toContain('第一模型')
    expect(ui.host.querySelector('[aria-label="CLI 自定义模型 ID"]')).toBeNull()
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    expect(modelProfilesApi.test).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('saves an explicitly selected model and its advertised effort without sending a model call', async () => {
  const ui = setup()
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    await act(async () => ui.set('CLI 模型', 'model:second'))
    await act(async () => ui.set('CLI 推理强度', 'high'))
    await act(async () => ui.click('保存'))
    expect(modelProfilesApi.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Codex CLI',
        model: 'second',
        cliModelMode: 'selected',
        reasoningEffort: 'high',
        codexPath: installation.path,
      }),
      '',
      false,
    )
    expect(modelProfilesApi.test).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('preserves explicit custom input when model refresh fails and blocks destructive rescan', async () => {
  const ui = setup()
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[profile]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    await act(async () => ui.set('CLI 模型', 'custom'))
    await act(async () => ui.set('CLI 自定义模型 ID', 'my-private-model'))
    vi.mocked(cliApi.codexCatalog).mockRejectedValueOnce({ message: '合成目录错误' })
    await act(async () => ui.click('刷新列表'))
    expect(ui.host.textContent).toContain('合成目录错误')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="CLI 自定义模型 ID"]')!.value).toBe(
      'my-private-model',
    )
    const scan = Array.from(ui.host.querySelectorAll('button')).find(
      (b) => b.textContent === '重新扫描',
    )!
    expect(scan.disabled).toBe(true)
    expect(modelProfilesApi.test).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('preserves stored configurations when scanning finds no current CLI', async () => {
  const ui = setup()
  vi.mocked(cliApi.scanCli).mockResolvedValue([])
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[profile]} {...callbacks} />))
    expect(ui.host.textContent).toContain('已有配置和聊天保留')
    expect(modelProfilesApi.removeProfile).not.toHaveBeenCalled()
    expect(modelProfilesApi.updateProfile).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('tests unsaved settings once and reports partial connectivity without saving', async () => {
  const ui = setup()
  vi.mocked(cliApi.testCli).mockResolvedValue({
    version: '0.146.0',
    modelReply: false,
    model: null,
    detail: '模型适配尚未验证',
  })
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    await act(async () => ui.click('测试连接'))
    expect(cliApi.testCli).toHaveBeenCalledWith(
      expect.objectContaining({ codexPath: installation.path }),
      expect.any(String),
    )
    expect(ui.host.textContent).toContain('模型测试未完成')
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    expect(modelProfilesApi.setDefault).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('cancels the unified test without a second request', async () => {
  const ui = setup()
  let reject!: (error: unknown) => void
  vi.mocked(cliApi.testCli).mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r
      }),
  )
  vi.mocked(modelProfilesApi.cancelTest).mockImplementation(async () => {
    reject({ message: '连接测试已取消' })
  })
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    await act(async () => ui.click('测试连接'))
    await act(async () => ui.click('停止测试'))
    expect(modelProfilesApi.cancelTest).toHaveBeenCalledWith(
      vi.mocked(cliApi.testCli).mock.calls[0][1],
    )
    expect(cliApi.testCli).toHaveBeenCalledTimes(1)
    expect(ui.host.textContent).toContain('连接测试已取消')
  } finally {
    await ui.end()
  }
})
it('shows reasoning availability and removes source, name and search controls', async () => {
  const ui = setup()
  vi.mocked(cliApi.codexCatalog).mockResolvedValue({ ...catalog, models: [] })
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    expect(ui.host.querySelector<HTMLSelectElement>('[aria-label="CLI 推理强度"]')!.disabled).toBe(
      true,
    )
    expect(ui.host.querySelector('[aria-label="CLI 配置名称"]')).toBeNull()
    expect(ui.host.querySelector('[placeholder="搜索名称或模型 ID"]')).toBeNull()
    expect(ui.host.querySelectorAll('select').length).toBe(2)
  } finally {
    await ui.end()
  }
})
it('uses the current system installation and allows discarding a changed saved path', async () => {
  const ui = setup()
  vi.mocked(cliApi.scanCli).mockResolvedValue([
    { ...installation, preferred: true },
    { ...installation, path: '/old/codex', preferred: false },
  ])
  try {
    await act(async () =>
      ui.root.render(
        <LocalCliSettings profiles={[{ ...profile, codexPath: '/old/codex' }]} {...callbacks} />,
      ),
    )
    await act(async () => ui.click('配置 Codex CLI'))
    expect(cliApi.codexCatalog).toHaveBeenCalledWith(installation.path)
    await act(async () => ui.click('放弃修改'))
    const scan = Array.from(ui.host.querySelectorAll('button')).find(
      (b) => b.textContent === '重新扫描',
    )!
    expect(scan.disabled).toBe(false)
    expect(modelProfilesApi.updateProfile).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})

it('scans on first activation only and keeps the list on reentry', async () => {
  const ui = setup()
  const render = (active: boolean) => (
    <LocalCliSettings active={active} profiles={[]} {...callbacks} />
  )
  try {
    await act(async () => ui.root.render(render(false)))
    expect(cliApi.scanCli).not.toHaveBeenCalled()
    await act(async () => ui.root.render(render(true)))
    expect(cliApi.scanCli).toHaveBeenCalledTimes(1)
    await act(async () => ui.root.render(render(false)))
    await act(async () => ui.root.render(render(true)))
    expect(cliApi.scanCli).toHaveBeenCalledTimes(1)
    expect(ui.host.textContent).toContain('Codex CLI')
    await act(async () => ui.click('重新扫描'))
    expect(cliApi.scanCli).toHaveBeenCalledTimes(2)
    expect(cliApi.codexCatalog).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('allows retry after the automatic scan fails without changing profiles', async () => {
  const ui = setup()
  vi.mocked(cliApi.scanCli).mockRejectedValueOnce({ message: '合成扫描错误' })
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[profile]} {...callbacks} />))
    expect(ui.host.textContent).toContain('合成扫描错误')
    await act(async () => ui.click('扫描本机 CLI'))
    expect(ui.host.textContent).toContain('Codex CLI')
    expect(cliApi.scanCli).toHaveBeenCalledTimes(2)
    expect(modelProfilesApi.updateProfile).not.toHaveBeenCalled()
    expect(modelProfilesApi.removeProfile).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('preserves hidden budgets and keeps test feedback inside the Codex item', async () => {
  const ui = setup()
  const stored = { ...profile, label: 'Codex CLI', contextChars: 48000, maxOutputTokens: 2048 }
  vi.mocked(modelProfilesApi.updateProfile).mockImplementation(async (p) => p)
  vi.mocked(cliApi.testCli).mockResolvedValue({
    version: 'synthetic',
    modelReply: false,
    model: null,
    detail: '合成测试反馈',
  })
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[stored]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    expect(ui.host.textContent).not.toContain('高级设置与诊断')
    expect([...ui.host.querySelectorAll('button')].some((b) => b.textContent === '保存')).toBe(
      false,
    )
    await act(async () => ui.set('CLI 模型', 'model:second'))
    await act(async () => ui.set('CLI 推理强度', 'high'))
    await act(async () => ui.click('保存'))
    expect(modelProfilesApi.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ contextChars: 48000, maxOutputTokens: 2048 }),
      '',
      false,
    )
    await act(async () => ui.click('测试连接'))
    const feedback = [...ui.host.querySelectorAll('[role="status"]')].find((node) =>
      node.textContent?.includes('合成测试反馈'),
    )!
    expect(feedback.closest('[data-slot="accordion-item"]')).toBeTruthy()
  } finally {
    await ui.end()
  }
})

it('saves the new-chat choice together with the CLI profile and restores it on discard', async () => {
  const ui = setup()
  vi.mocked(modelProfilesApi.updateProfile).mockImplementation(async (p) => p)
  const stored = { ...profile, label: 'Codex CLI' }
  try {
    await act(async () =>
      ui.root.render(
        <LocalCliSettings
          profiles={[stored]}
          preferences={{ defaultProfileId: stored.id }}
          {...callbacks}
        />,
      ),
    )
    await act(async () => ui.click('配置 Codex CLI'))
    const toggle = () => ui.host.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    await act(async () => toggle().click())
    expect(modelProfilesApi.setDefault).not.toHaveBeenCalled()
    await act(async () => ui.click('放弃修改'))
    expect(toggle().getAttribute('aria-checked')).toBe('true')
    await act(async () => toggle().click())
    await act(async () => ui.click('保存'))
    expect(modelProfilesApi.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: stored.id }),
      '',
      false,
    )
    expect(modelProfilesApi.setDefault).not.toHaveBeenCalled()
    expect(ui.host.textContent).not.toContain('设为聊天默认')
  } finally {
    await ui.end()
  }
})
it('keeps the combined selection editable after saving fails', async () => {
  const ui = setup()
  vi.mocked(modelProfilesApi.configure).mockRejectedValueOnce({ message: '合成保存失败' })
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    await act(async () => ui.click('配置 Codex CLI'))
    const toggle = ui.host.querySelector<HTMLButtonElement>('[role="switch"]')!
    await act(async () => toggle.click())
    await act(async () => ui.click('保存'))
    expect(modelProfilesApi.configure).toHaveBeenCalledWith(expect.anything(), '', true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(ui.host.textContent).toContain('合成保存失败')
    expect(modelProfilesApi.setDefault).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})

it('does not block other settings while loading the model catalog', async () => {
  const ui = setup()
  let finish!: (value: CliCatalog) => void
  vi.mocked(cliApi.codexCatalog).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  try {
    await act(async () => ui.root.render(<LocalCliSettings profiles={[]} {...callbacks} />))
    callbacks.onBusy.mockClear()
    await act(async () => ui.click('配置 Codex CLI'))
    expect(callbacks.onBusy).not.toHaveBeenCalledWith(true)
    expect(ui.host.querySelector<HTMLSelectElement>('[aria-label="CLI 模型"]')!.disabled).toBe(true)
    await act(async () => finish(catalog))
    expect(ui.host.querySelector<HTMLSelectElement>('[aria-label="CLI 模型"]')!.disabled).toBe(
      false,
    )
  } finally {
    await act(async () => finish(catalog))
    await ui.end()
  }
})
