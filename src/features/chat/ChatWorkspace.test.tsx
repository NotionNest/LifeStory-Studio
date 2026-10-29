// @vitest-environment jsdom
import { modelProfilesApi, type AiProfile } from '@/services/modelProfiles'
import { chatsApi, type AiWorkspace } from '@/services/chats'
import { searchApi } from '@/services/search'
import { diaryPreviewsApi, type DiaryPreview } from '@/services/diaryPreviews'
import { aiTasksApi } from '@/services/aiTasks'
import { recordsApi } from '@/services/records'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ChatRouteHarness as ChatWorkspace } from '@/test/ChatRouteHarness'
import { LocalCliSettings } from '@/features/settings/LocalCliSettings'
import { AiSettings } from '@/features/settings/AiSettings'

vi.mock('@/services/cli', async (original) => ({
  ...(await original<typeof import('@/services/cli')>()),
  cliApi: { codexCatalog: vi.fn(), inspectCodex: vi.fn(), codexModels: vi.fn() },
}))
vi.mock('@/services/modelProfiles', async (original) => ({
  ...(await original<typeof import('@/services/modelProfiles')>()),
  modelProfilesApi: {
    preferences: vi.fn(),
    configure: vi.fn(),
    updateProfile: vi.fn(),
    setDefault: vi.fn(),
    test: vi.fn(),
    removeProfile: vi.fn(),
    models: vi.fn(),
  },
}))
vi.mock('@/services/chats', async (original) => ({
  ...(await original<typeof import('@/services/chats')>()),
  chatsApi: { chats: vi.fn(), workspace: vi.fn(), send: vi.fn() },
}))
vi.mock('@/services/diaryPreviews', async (original) => ({
  ...(await original<typeof import('@/services/diaryPreviews')>()),
  diaryPreviewsApi: { generatePreview: vi.fn(), preview: vi.fn(), adopt: vi.fn() },
}))
vi.mock('@/services/aiTasks', async (original) => ({
  ...(await original<typeof import('@/services/aiTasks')>()),
  aiTasksApi: {
    task: vi.fn().mockResolvedValue({ recordId: 'chat' }),
    cancel: vi.fn(),
    compare: vi.fn(),
  },
}))
vi.mock('@/services/search', async (original) => ({
  ...(await original<typeof import('@/services/search')>()),
  searchApi: { query: vi.fn() },
}))
vi.mock('@/services/records', async (original) => ({
  ...(await original<typeof import('@/services/records')>()),
  recordsApi: { read: vi.fn() },
}))
vi.mock('@/services/trash', async (original) => ({
  ...(await original<typeof import('@/services/trash')>()),
  trashApi: { trashImpact: vi.fn() },
}))
const messageRenders = vi.hoisted(() => vi.fn())
vi.mock('./MessageDetails', async (original) => {
  const actual = await original<typeof import('./MessageDetails')>()
  return {
    ...actual,
    MessageDetails: (props: Parameters<typeof actual.MessageDetails>[0]) => {
      messageRenders(props.text)
      return <actual.MessageDetails {...props} />
    },
  }
})
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: Observer,
  IntersectionObserver: Observer,
})
Object.defineProperties(HTMLElement.prototype, {
  clientHeight: {
    configurable: true,
    get() {
      return this.getAttribute('aria-label') === '聊天消息' ? 600 : 180
    },
  },
  clientWidth: {
    configurable: true,
    get() {
      return 900
    },
  },
})
HTMLDialogElement.prototype.showModal = function () {
  this.open = true
}
Element.prototype.scrollTo = function () {}
Element.prototype.scrollIntoView = function () {}
const profile: AiProfile = {
  id: 'service',
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
const workspace: AiWorkspace = {
  page: { hasBefore: false, hasAfter: false, latest: { id: 'm1', sequence: 0 }, hasUserText: true },
  id: 'chat',
  title: '散步聊天',
  kind: 'conversation',
  messages: [{ id: 'm1', role: 'user', text: '今天散步', sequence: 0 }],
  sources: [],
  related: [],
  task: null,
  profileId: 'service',
  linkedDiaryId: null,
}
const preview: DiaryPreview = {
  taskId: 'generate',
  text: '今天去公园散步。',
  title: '散步',
  recordDate: '2026-10-21',
  mode: 'create',
  targetId: null,
  targetVersion: null,
  adoptedId: null,
}
function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const mount = document.createElement('div'),
    titlebar = document.createElement('div')
  titlebar.dataset.testTitlebar = ''
  host.append(titlebar, mount)
  const root = createRoot(mount)
  return {
    host,
    root,
    click: (label: string) => {
      const b = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === label || b.getAttribute('aria-label') === label,
      )!
      expect(b).toBeTruthy()
      b.click()
    },
    set: (label: string, value: string) => {
      const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[aria-label="${label}"]`,
      )!
      const proto =
        el.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : el.tagName === 'SELECT'
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    },
    end: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}
function mocks() {
  vi.clearAllMocks()
  vi.mocked(modelProfilesApi.models).mockResolvedValue(['test-model', 'another-model'])
  vi.mocked(chatsApi.chats).mockResolvedValue({
    items: [{ id: 'chat', title: '散步聊天', updatedAt: 0, profileId: 'service' }],
    nextOffset: null,
  })
  vi.mocked(chatsApi.workspace).mockResolvedValue(workspace)
  vi.mocked(chatsApi.send).mockResolvedValue({
    id: 'send',
    recordId: 'chat',
    status: 'running',
    partial: '',
    error: null,
    resultId: null,
  })
  vi.mocked(searchApi.query).mockResolvedValue({
    items: [],
    total: 0,
    nextOffset: null,
    days: [],
    tags: [],
  })
}
const props = {
  get titlebarTarget() {
    return document.querySelector<HTMLElement>('[data-test-titlebar]')
  },
  active: true,
  profiles: [profile],
  preferences: { defaultProfileId: 'service' },
  intent: null,
  onSettings: vi.fn(),
  onOpenDiary: vi.fn(),
  onDirty: vi.fn(),
  onBusy: vi.fn(),
}
it('sends the first message directly with the default service, without creating a diary or blank chat first', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    expect(chatsApi.send).not.toHaveBeenCalled()
    await act(async () => ui.set('聊天输入', '合成讲述'))
    await act(async () => ui.click('发送消息'))
    expect(chatsApi.send).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        profileId: 'service',
        text: '合成讲述',
        sourceIds: [],
      }),
    )
    expect(diaryPreviewsApi.adopt).not.toHaveBeenCalled()
    expect(ui.host.textContent).toContain('今天散步')
  } finally {
    await ui.end()
  }
})
it('generates an editable preview and only creates a diary after explicit adoption', async () => {
  mocks()
  vi.mocked(diaryPreviewsApi.generatePreview).mockResolvedValue({
    id: 'generate',
    recordId: 'chat',
    status: 'completed',
    partial: preview.text,
    error: null,
    resultId: null,
  })
  vi.mocked(diaryPreviewsApi.preview).mockResolvedValue(preview)
  vi.mocked(diaryPreviewsApi.adopt).mockImplementation(async () => {
    vi.mocked(diaryPreviewsApi.preview).mockResolvedValue({ ...preview, adoptedId: 'diary' })
    return { recordId: 'diary' }
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      task: {
        id: 'generate',
        recordId: 'chat',
        status: 'completed',
        partial: preview.text,
        error: null,
        resultId: null,
      },
    })
    await act(async () => ui.click('保存为日记'))
    expect(diaryPreviewsApi.adopt).not.toHaveBeenCalled()
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).not.toBeNull()
    await act(async () => ui.set('日记预览正文', '我自己修改后的内容'))
    await act(async () => ui.click('创建日记'))
    expect(diaryPreviewsApi.adopt).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'generate', text: '我自己修改后的内容' }),
    )
    await act(async () => ui.click('打开日记'))
    expect(props.onOpenDiary).toHaveBeenCalledWith('diary')
  } finally {
    await ui.end()
  }
})
it('keeps unsent messages when going to settings and uses the remembered service for an existing chat', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.set('聊天输入', '尚未发送的讲述'))
    await act(async () => ui.root.render(<ChatWorkspace {...props} active={false} />))
    await act(async () => ui.root.render(<ChatWorkspace {...props} active />))
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '尚未发送的讲述',
    )
    await act(async () => ui.click('散步聊天'))
    expect(ui.host.querySelector('[aria-label="聊天模型"]')!.textContent).toContain(profile.label)
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('does not send during Chinese composition, and cancellation is explicit', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.set('聊天输入', '中文输入'))
    await act(async () =>
      ui.host.querySelector('textarea')!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey: true,
          isComposing: true,
          bubbles: true,
        }),
      ),
    )
    expect(chatsApi.send).not.toHaveBeenCalled()
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      task: {
        id: 'running',
        recordId: 'chat',
        status: 'running',
        partial: '正在回应',
        error: null,
        resultId: null,
      },
    })
    await act(async () => ui.click('散步聊天'))
    vi.mocked(aiTasksApi.cancel).mockResolvedValue(undefined)
    await act(async () => ui.click('停止生成'))
    expect(aiTasksApi.cancel).toHaveBeenCalledWith('running')
  } finally {
    await ui.end()
  }
})
it('saves credentials only on explicit action and sets the default without calling a model', async () => {
  mocks()
  vi.mocked(modelProfilesApi.configure).mockResolvedValue(profile)
  vi.mocked(modelProfilesApi.setDefault).mockResolvedValue(undefined)
  const ui = setup()
  try {
    await act(async () =>
      ui.root.render(
        <AiSettings
          active
          profiles={[profile]}
          preferences={{ defaultProfileId: null }}
          onChange={vi.fn()}
        />,
      ),
    )
    await act(async () => ui.set('已配置服务', 'new'))
    await act(async () => {
      ui.set('AI 配置名称', '合成服务')
      ui.set('AI 模型 ID', 'test-model')
      ui.set('AI API Key', 'synthetic-not-real')
    })
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    await act(async () => ui.click('保存服务配置'))
    expect(modelProfilesApi.configure).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model' }),
      'synthetic-not-real',
    )
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.value).toBe('')
    await act(async () => ui.click('设为默认'))
    expect(modelProfilesApi.setDefault).toHaveBeenCalledWith('service')
    expect(modelProfilesApi.test).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('keeps the active chat visible when its history item is selected again', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    expect(ui.host.textContent).toContain('今天散步')
    await act(async () => ui.click('散步聊天'))
    expect(ui.host.textContent).toContain('今天散步')
  } finally {
    await ui.end()
  }
})
it('does not show a late preview in a different conversation', async () => {
  mocks()
  let resolve!: (value: DiaryPreview) => void
  vi.mocked(diaryPreviewsApi.preview).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  vi.mocked(chatsApi.chats).mockResolvedValue({
    items: [
      { id: 'chat', title: '散步聊天', updatedAt: 0, profileId: 'service' },
      { id: 'other', title: '另一段聊天', updatedAt: 0, profileId: 'service' },
    ],
    nextOffset: null,
  })
  vi.mocked(diaryPreviewsApi.generatePreview).mockResolvedValue({
    id: 'generate',
    recordId: 'chat',
    status: 'completed',
    partial: preview.text,
    error: null,
    resultId: null,
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      task: {
        id: 'generate',
        recordId: 'chat',
        status: 'completed',
        partial: preview.text,
        error: null,
        resultId: null,
      },
    })
    await act(async () => ui.click('保存为日记'))
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      id: 'other',
      title: '另一段聊天',
      messages: [{ id: 'other-message', role: 'user', text: '另一段经历', sequence: 0 }],
    })
    await act(async () => ui.click('另一段聊天'))
    await act(async () => resolve(preview))
    expect(ui.host.textContent).toContain('另一段经历')
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
  } finally {
    await ui.end()
  }
})
it('discards a cached preview when its source is invalidated while visiting diaries', async () => {
  mocks()
  vi.mocked(diaryPreviewsApi.generatePreview).mockResolvedValue({
    id: 'generate',
    recordId: 'chat',
    status: 'completed',
    partial: preview.text,
    error: null,
    resultId: null,
  })
  vi.mocked(diaryPreviewsApi.preview).mockResolvedValue(preview)
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      task: {
        id: 'generate',
        recordId: 'chat',
        status: 'completed',
        partial: preview.text,
        error: null,
        resultId: null,
      },
    })
    await act(async () => ui.click('保存为日记'))
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).not.toBeNull()
    await act(async () => ui.click('返回聊天'))
    await act(async () => ui.root.render(<ChatWorkspace {...props} active={false} />))
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      task: {
        id: 'generate',
        recordId: 'chat',
        status: 'cancelled',
        partial: '',
        error: '来源已删除',
        resultId: null,
      },
      previewTaskId: null,
    })
    vi.mocked(diaryPreviewsApi.preview).mockRejectedValue({ message: '来源已删除，预览失效' })
    await act(async () => ui.root.render(<ChatWorkspace {...props} active />))
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
    expect(ui.host.textContent).not.toContain(preview.text)
  } finally {
    await ui.end()
  }
})

it('stays in messages after closing a preview and returning from settings', async () => {
  mocks()
  vi.mocked(diaryPreviewsApi.generatePreview).mockResolvedValue({
    id: 'generate',
    recordId: 'chat',
    status: 'completed',
    partial: preview.text,
    error: null,
    resultId: null,
  })
  vi.mocked(diaryPreviewsApi.preview).mockResolvedValue(preview)
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    vi.mocked(chatsApi.workspace).mockResolvedValue({
      ...workspace,
      task: {
        id: 'generate',
        recordId: 'chat',
        status: 'completed',
        partial: preview.text,
        error: null,
        resultId: null,
      },
      previewTaskId: 'generate',
    })
    await act(async () => ui.click('保存为日记'))
    await act(async () => ui.click('返回聊天'))
    await act(async () => ui.root.render(<ChatWorkspace {...props} active={false} />))
    await act(async () => ui.root.render(<ChatWorkspace {...props} active />))
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
    expect(ui.host.textContent).toContain('今天散步')
  } finally {
    await ui.end()
  }
})

it('opens the local CLI category separately from API credentials', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () =>
      ui.root.render(
        <LocalCliSettings
          active={false}
          profiles={[]}
          onChange={vi.fn()}
          onDirty={vi.fn()}
          onBusy={vi.fn()}
        />,
      ),
    )
    expect(ui.host.querySelector('[aria-label="AI API Key"]')).toBeNull()
    expect(ui.host.textContent).toContain('扫描本机 CLI')
  } finally {
    await ui.end()
  }
})
it('updates an unsent chat using the replaced default configuration after settings save', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.set('聊天输入', '保留未发送的文字'))
    await act(async () =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          profiles={[
            { ...profile, label: '[已停用] 合成服务' },
            { ...profile, id: 'replacement' },
          ]}
          preferences={{ defaultProfileId: 'replacement' }}
        />,
      ),
    )
    expect(ui.host.querySelector('[aria-label="聊天模型"]')!.textContent).not.toContain('[已停用]')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '保留未发送的文字',
    )
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})

it('keeps unsent input when its history sidebar is collapsed and reopened', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.set('聊天输入', '侧栏收起后继续讲述'))
    const sidebar = ui.host.querySelector('[aria-label="聊天历史"]')
    await act(async () => ui.root.render(<ChatWorkspace {...props} sidebarOpen={false} />))
    expect(ui.host.querySelector('[aria-label="聊天历史"]')!.getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(ui.host.querySelector('[aria-label="聊天历史"]')!.hasAttribute('inert')).toBe(true)
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '侧栏收起后继续讲述',
    )
    await act(async () => ui.root.render(<ChatWorkspace {...props} sidebarOpen />))
    expect(ui.host.querySelector('[aria-label="聊天历史"]')).toBe(sidebar)
    expect(sidebar!.hasAttribute('inert')).toBe(false)
    expect(sidebar!.getAttribute('aria-hidden')).toBe('false')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '侧栏收起后继续讲述',
    )
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})

it('opens exact search messages, repeats locations in the same chat and preserves an unsent draft', async () => {
  mocks()
  const ui = setup()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(() => ui.set('聊天输入', '未发送的新聊天草稿'))
    await act(async () =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          intent={{ chatId: 'chat', messageId: 'm1', keyword: '散步', nonce: 1 }}
        />,
      ),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(chatsApi.workspace).toHaveBeenCalledWith('chat', { around: 'm1' })
    expect(ui.host.querySelector('mark')?.textContent).toBe('散步')
    expect(document.activeElement?.getAttribute('data-message-id')).toBe('m1')
    await act(async () =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          intent={{ chatId: 'chat', messageId: 'm1', keyword: '今天', nonce: 2 }}
        />,
      ),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(document.activeElement?.getAttribute('data-message-id')).toBe('m1')
    expect(ui.host.querySelector('mark')?.textContent).toBe('今天')
    await act(() => ui.click('新对话'))
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '未发送的新聊天草稿',
    )
    expect(ui.host.querySelector('mark')).toBeNull()
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
    vi.unstubAllGlobals()
  }
})
it('reports a missing search message instead of silently locating another message', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          intent={{ chatId: 'chat', messageId: 'missing', keyword: '旅行', nonce: 3 }}
        />,
      ),
    )
    expect(ui.host.textContent).toContain('命中的消息已不存在')
    expect(ui.host.querySelector('[data-message-id]:focus')).toBeNull()
  } finally {
    await ui.end()
  }
})

it('keeps diary chat drafts separate and resumes the same sent conversation after closing or switching modules', async () => {
  mocks()
  vi.mocked(recordsApi.read).mockImplementation(async (id) => ({
    id,
    title: id,
    recordDate: '2026-10-26',
    createdTimezone: 'Asia/Shanghai',
    createdAt: 0,
    updatedAt: 0,
    contentVersion: 0,
    checkpointId: 'base',
    document: { type: 'doc', content: [] },
    tags: [],
  }))
  const ui = setup(),
    close = vi.fn(),
    saved = vi.fn(async (action: () => Promise<void>) => action())
  const text = () => ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value
  try {
    await act(() => ui.root.render(<ChatWorkspace {...props} />))
    await act(() => ui.set('聊天输入', '普通聊天草稿'))
    await act(() =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          sidebarOpen={false}
          onClose={close}
          withSavedDiary={saved}
          intent={{ diaryId: 'diary-a', nonce: 11 }}
        />,
      ),
    )
    await act(() => ui.set('聊天输入', '日记 A 的草稿'))
    await act(() =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          sidebarOpen={false}
          onClose={close}
          withSavedDiary={saved}
          intent={{ diaryId: 'diary-b', nonce: 12 }}
        />,
      ),
    )
    await act(() => ui.set('聊天输入', '日记 B 的草稿'))
    await act(() =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          sidebarOpen={false}
          onClose={close}
          withSavedDiary={saved}
          intent={{ diaryId: 'diary-a', nonce: 13 }}
        />,
      ),
    )
    expect(text()).toBe('日记 A 的草稿')
    await act(async () => ui.click('关闭侧边聊天'))
    expect(ui.host.querySelector('[aria-label="关闭侧边聊天"]')).toBeNull()
    expect(chatsApi.send).not.toHaveBeenCalled()
    await act(async () =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          sidebarOpen={false}
          onClose={close}
          withSavedDiary={saved}
          intent={{ diaryId: 'diary-a', nonce: 130 }}
        />,
      ),
    )
    await act(() => ui.click('发送消息'))
    expect(saved).toHaveBeenCalledOnce()
    expect(chatsApi.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: null, sourceIds: ['diary-a'] }),
    )
    await act(() => ui.set('聊天输入', '继续这段对话'))
    await act(() =>
      ui.root.render(<ChatWorkspace {...props} intent={{ chatId: null, nonce: 14 }} />),
    )
    expect(text()).toBe('普通聊天草稿')
    await act(() =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          sidebarOpen={false}
          onClose={close}
          withSavedDiary={saved}
          intent={{ diaryId: 'diary-a', nonce: 15 }}
        />,
      ),
    )
    expect(text()).toBe('继续这段对话')
    await act(() => ui.click('发送消息'))
    expect(chatsApi.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: 'chat', sourceIds: ['diary-a'] }),
    )
  } finally {
    await ui.end()
  }
})

it('does not send from the side panel if diary persistence is blocked', async () => {
  mocks()
  vi.mocked(recordsApi.read).mockResolvedValue({ id: 'diary', title: '合成日记' } as Awaited<
    ReturnType<typeof recordsApi.read>
  >)
  const ui = setup()
  try {
    await act(() =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          sidebarOpen={false}
          onClose={vi.fn()}
          intent={{ diaryId: 'diary', nonce: 20 }}
          withSavedDiary={async () => {
            throw new Error('合成日记保存失败')
          }}
        />,
      ),
    )
    await act(() => ui.set('聊天输入', '保留这条消息'))
    await act(() => ui.click('发送消息'))
    expect(chatsApi.send).not.toHaveBeenCalled()
    expect(ui.host.textContent).toContain('合成日记保存失败')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '保留这条消息',
    )
  } finally {
    await ui.end()
  }
})
it('opens diary selection with @ without inserting it or sending, and Escape returns to the draft', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(() => ui.set('聊天输入', '保留草稿'))
    const input = ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!
    await act(() =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '@',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
    expect(ui.host.querySelector('[aria-label="附加日记"]')).toBeNull()
    await act(() =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: '@', bubbles: true, cancelable: true }),
      ),
    )
    expect(ui.host.querySelector('[aria-label="附加日记"]')).toBeTruthy()
    expect(input.value).toBe('保留草稿')
    expect(searchApi.query).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '', offset: 0 }),
    )
    expect(chatsApi.send).not.toHaveBeenCalled()
    await act(() =>
      ui.host
        .querySelector('[aria-label="查找上下文日记"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(ui.host.querySelector('[aria-label="附加日记"]')).toBeNull()
    expect(input.value).toBe('保留草稿')
  } finally {
    await ui.end()
  }
})
it('groups diary and image actions in the add menu', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    const trigger = ui.host.querySelector('[aria-label="添加附件"]')!
    await act(() =>
      trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })),
    )
    const diary = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (node) => node.textContent === '附加日记',
    )!
    expect(diary).toBeTruthy()
    expect(
      [...document.querySelectorAll('[role="menuitem"]')].some(
        (node) => node.textContent === '添加图片',
      ),
    ).toBe(true)
    await act(() => diary.click())
    expect(ui.host.querySelector('[aria-label="附加日记"]')).toBeTruthy()
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})

it('places chat actions in the titlebar and clears them when inactive', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    const titlebar = props.titlebarTarget!
    expect(titlebar.querySelector('[aria-label="保存为日记"]')).toBeTruthy()
    expect(titlebar.querySelector('[aria-label="更多操作"]')).toBeTruthy()
    expect(ui.host.querySelector('[aria-label="聊天工作区"] [aria-label="更多操作"]')).toBeNull()
    expect(ui.host.textContent).not.toContain('将聊天内容用于日记')
    await act(() =>
      titlebar
        .querySelector('[aria-label="更多操作"]')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })),
    )
    const rename = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (node) => node.textContent === '重命名',
    )!
    expect(rename).toBeTruthy()
    expect(
      [...document.querySelectorAll('[role="menuitem"]')].some(
        (node) => node.textContent === '删除聊天',
      ),
    ).toBe(true)
    await act(async () => {
      rename.click()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(ui.host.querySelector('[aria-label="聊天名称"]')).toBeTruthy()
    await act(async () => ui.root.render(<ChatWorkspace {...props} active={false} />))
    expect(titlebar.children.length).toBe(0)
    expect(diaryPreviewsApi.adopt).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
it('sends the chat model override without changing the saved service and retains it in drafts', async () => {
  mocks()
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(() => ui.host.querySelector<HTMLButtonElement>('[aria-label="聊天模型"]')!.click())
    await act(() => {
      const option = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((node) =>
        node.textContent?.includes('another-model'),
      )!
      option.click()
    })
    await act(() => ui.set('聊天输入', '合成模型选择'))
    await act(async () => ui.click('散步聊天'))
    await act(async () => ui.click('新对话'))
    expect(ui.host.querySelector('[aria-label="聊天模型"]')!.textContent).toContain('another-model')
    await act(async () => ui.click('发送消息'))
    expect(chatsApi.send).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { model: 'another-model', reasoningEffort: null } }),
    )
    expect(profile.model).toBe('test-model')
    expect(modelProfilesApi.configure).not.toHaveBeenCalled()
    expect(modelProfilesApi.setDefault).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})

it('shows time and copy only for assistant replies', async () => {
  mocks()
  vi.mocked(chatsApi.workspace).mockResolvedValue({
    ...workspace,
    messages: [
      { id: 'user-time', role: 'user', text: '合成问题', sequence: 0, createdAt: 1000 },
      {
        id: 'assistant-time',
        role: 'assistant',
        text: '合成答复',
        sequence: 1,
        createdAt: 2000,
        durationMs: 1000,
      },
    ],
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    expect(ui.host.querySelectorAll('[aria-label="复制消息"]').length).toBe(1)
    expect(ui.host.querySelectorAll('time').length).toBe(1)
    expect(ui.host.querySelector('time')!.dateTime).toBe(new Date(2000).toISOString())
  } finally {
    await ui.end()
  }
})
it('queues during generation, sends in order and keeps the next unsent draft', async () => {
  mocks()
  vi.useFakeTimers()
  let server: AiWorkspace = {
    ...workspace,
    page: { ...workspace.page, hasAfter: true, latest: { id: 'future', sequence: 100 } },
    task: {
      id: 'first',
      recordId: 'chat',
      status: 'running',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => server)
  vi.mocked(chatsApi.send).mockImplementation(async (input) => {
    server = {
      ...server,
      task: {
        id: input.requestId,
        recordId: 'chat',
        status: 'running',
        partial: '',
        error: null,
        resultId: null,
      },
    }
    return server.task!
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.disabled).toBe(
      false,
    )
    await act(() => ui.set('聊天输入', '第一条待发送'))
    await act(() => ui.click('发送消息'))
    await act(() => ui.set('聊天输入', '第二条待发送'))
    await act(() => ui.click('发送消息'))
    await act(() => ui.set('聊天输入', '还在写的草稿'))
    expect(chatsApi.send).not.toHaveBeenCalled()
    expect(ui.host.querySelector('[aria-label="待发送消息"]')!.textContent).toContain(
      '第二条待发送',
    )
    await act(async () =>
      ui.root.render(
        <ChatWorkspace
          {...props}
          intent={{ chatId: 'chat', messageId: 'm1', keyword: '散步', nonce: 55 }}
        />,
      ),
    )
    expect(ui.host.querySelector('mark')?.textContent).toBe('散步')
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(ui.host.querySelector('mark')?.textContent).toBe('散步')
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    expect(chatsApi.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: 'chat',
        text: '第一条待发送',
        profileId: 'service',
      }),
    )
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '还在写的草稿',
    )
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(ui.host.querySelector('mark')?.textContent).toBe('散步')
    expect(chatsApi.send).toHaveBeenCalledTimes(2)
    expect(chatsApi.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '第二条待发送' }),
    )
    expect(ui.host.querySelector('[aria-label="待发送消息"]')).toBeNull()
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '还在写的草稿',
    )
  } finally {
    await ui.end()
    vi.useRealTimers()
  }
})
it('pauses queued messages on stop and later failure, retrying the same envelope explicitly', async () => {
  mocks()
  vi.useFakeTimers()
  let server: AiWorkspace = {
    ...workspace,
    task: {
      id: 'first',
      recordId: 'chat',
      status: 'running',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => server)
  vi.mocked(aiTasksApi.cancel).mockImplementation(async () => {
    server = { ...server, task: { ...server.task!, status: 'cancelled' } }
  })
  vi.mocked(chatsApi.send).mockImplementation(async (input) => {
    server = {
      ...server,
      task: {
        id: input.requestId,
        recordId: 'chat',
        status: 'running',
        partial: '',
        error: null,
        resultId: null,
      },
    }
    return server.task!
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    for (const text of ['停止后待发送', '失败后待发送']) {
      await act(() => ui.set('聊天输入', text))
      await act(() => ui.click('发送消息'))
    }
    await act(async () => ui.click('停止生成'))
    expect(chatsApi.send).not.toHaveBeenCalled()
    await act(async () => ui.click('继续发送'))
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    server = { ...server, task: { ...server.task!, status: 'failed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    vi.mocked(chatsApi.send).mockRejectedValueOnce({ message: '合成发送失败' })
    await act(async () => ui.click('继续发送'))
    const failed = vi.mocked(chatsApi.send).mock.calls[1][0]
    expect(ui.host.querySelector('[aria-label="待发送消息"]')!.textContent).toContain(
      '合成发送失败',
    )
    await act(async () => ui.click('继续发送'))
    expect(chatsApi.send).toHaveBeenLastCalledWith(failed)
  } finally {
    await ui.end()
    vi.useRealTimers()
  }
})
it('retains removable queued drafts across chat changes and does not send while hidden', async () => {
  mocks()
  vi.useFakeTimers()
  let server: AiWorkspace = {
    ...workspace,
    task: {
      id: 'first',
      recordId: 'chat',
      status: 'running',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => server)
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    await act(() => ui.set('聊天输入', '切换后保留'))
    await act(() => ui.click('发送消息'))
    await act(() => ui.click('新对话'))
    expect(ui.host.querySelector('[aria-label="待发送消息"]')).toBeNull()
    await act(async () => ui.click('散步聊天'))
    expect(ui.host.querySelector('[aria-label="待发送消息"]')!.textContent).toContain('切换后保留')
    await act(async () => ui.root.render(<ChatWorkspace {...props} active={false} />))
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(chatsApi.send).not.toHaveBeenCalled()
    server = { ...server, task: { ...server.task!, status: 'running' } }
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(() => ui.click('移除待发送消息：切换后保留'))
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
    vi.useRealTimers()
  }
})
it('edits queued text in place without dispatching mid-edit or replacing the composer draft', async () => {
  mocks()
  vi.useFakeTimers()
  let server: AiWorkspace = {
    ...workspace,
    task: {
      id: 'first',
      recordId: 'chat',
      status: 'running',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => server)
  vi.mocked(chatsApi.send).mockImplementation(async (input) => {
    server = {
      ...server,
      task: {
        id: input.requestId,
        recordId: 'chat',
        status: 'running',
        partial: '',
        error: null,
        resultId: null,
      },
    }
    return server.task!
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    for (const text of ['待修改原文', '下一条原文']) {
      await act(() => ui.set('聊天输入', text))
      await act(() => ui.click('发送消息'))
    }
    await act(() => ui.set('聊天输入', '主输入草稿'))
    await act(() => ui.click('修改待发送消息：待修改原文'))
    await act(() => ui.set('修改待发送消息：待修改原文', '   '))
    expect(
      [...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.textContent === '保存修改',
      )!.disabled,
    ).toBe(true)
    await act(() => ui.set('修改待发送消息：待修改原文', '修改后的消息'))
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(chatsApi.send).not.toHaveBeenCalled()
    await act(() => ui.click('新对话'))
    await act(async () => ui.click('散步聊天'))
    expect(
      ui.host.querySelector<HTMLTextAreaElement>('[aria-label="修改待发送消息：待修改原文"]')!
        .value,
    ).toBe('修改后的消息')
    expect(chatsApi.send).not.toHaveBeenCalled()
    await act(async () => ui.click('保存修改'))
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    expect(chatsApi.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '修改后的消息', conversationId: 'chat' }),
    )
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '主输入草稿',
    )
    await act(() => ui.click('修改待发送消息：下一条原文'))
    await act(() => ui.set('修改待发送消息：下一条原文', '将要取消的修改'))
    await act(() => ui.click('取消修改'))
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(chatsApi.send).toHaveBeenCalledTimes(2)
    expect(chatsApi.send).toHaveBeenLastCalledWith(expect.objectContaining({ text: '下一条原文' }))
  } finally {
    await ui.end()
    vi.useRealTimers()
  }
})
it('keeps failed queued edits paused and reuses the original request ID on explicit retry', async () => {
  mocks()
  vi.useFakeTimers()
  let server: AiWorkspace = {
    ...workspace,
    task: {
      id: 'first',
      recordId: 'chat',
      status: 'running',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => server)
  vi.mocked(chatsApi.send).mockRejectedValue({ message: '合成状态待核对' })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    await act(() => ui.set('聊天输入', '原排队消息'))
    await act(() => ui.click('发送消息'))
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    const original = vi.mocked(chatsApi.send).mock.calls[0][0]
    await act(() => ui.click('修改待发送消息：原排队消息'))
    await act(() => ui.set('修改待发送消息：原排队消息', '修改后再核对'))
    await act(() => ui.click('保存修改'))
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    await act(async () => ui.click('继续发送'))
    expect(chatsApi.send).toHaveBeenLastCalledWith({ ...original, text: '修改后再核对' })
    await act(() => ui.click('移除待发送消息：修改后再核对'))
    expect(ui.host.querySelector('[aria-label="待发送消息"]')).toBeNull()
  } finally {
    await ui.end()
    vi.useRealTimers()
  }
})

it('typing does not render existing messages and sending uses the latest input', async () => {
  mocks()
  vi.mocked(chatsApi.workspace).mockResolvedValue({
    ...workspace,
    messages: [
      ...workspace.messages,
      { id: 'reply', role: 'assistant', text: '合成回复', sequence: 1 },
    ],
  })
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    expect(messageRenders).toHaveBeenCalled()
    messageRenders.mockClear()
    for (const text of ['新', '新的', '新的输入']) await act(() => ui.set('聊天输入', text))
    expect(messageRenders).not.toHaveBeenCalled()
    expect(ui.host.textContent).toContain('合成回复')
    await act(async () => ui.click('发送消息'))
    expect(chatsApi.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '新的输入', conversationId: 'chat' }),
    )
  } finally {
    await ui.end()
  }
})
it('polling still updates messages while retaining the independent composer draft', async () => {
  mocks()
  vi.useFakeTimers()
  let server: AiWorkspace = {
    ...workspace,
    task: {
      id: 'stream',
      recordId: 'chat',
      status: 'running',
      partial: '开始',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => server)
  const ui = setup()
  try {
    await act(async () => ui.root.render(<ChatWorkspace {...props} />))
    await act(async () => ui.click('散步聊天'))
    await act(() => ui.set('聊天输入', '尚未发送的下一段'))
    messageRenders.mockClear()
    server = { ...server, task: { ...server.task!, partial: '新的生成内容' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(messageRenders).toHaveBeenCalled()
    expect(ui.host.textContent).toContain('新的生成内容')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')?.value).toBe(
      '尚未发送的下一段',
    )
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.end()
    vi.useRealTimers()
  }
})
