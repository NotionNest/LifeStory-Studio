// @vitest-environment jsdom
import { recordsApi, recordEvents, type RecordFile } from '@/services/records'
import { searchApi } from '@/services/search'
import { historyApi } from '@/services/history'
import { trashApi } from '@/services/trash'
import { modelProfilesApi, type AiProfile } from '@/services/modelProfiles'
import { cliApi } from '@/services/cli'
import { chatsApi } from '@/services/chats'
import { aiTasksApi } from '@/services/aiTasks'
import { diaryPreviewsApi } from '@/services/diaryPreviews'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { desktop } from '@/services/desktop'
import { createApplicationRouter } from '@/app/App'

const events = vi.hoisted(() => new Map<string, Set<() => void>>())
vi.mock('@/services/desktop', async (original) => {
  const actual = await original<typeof import('@/services/desktop')>()
  return {
    ...actual,
    desktopAvailable: true,
    desktop: {
      ...actual.desktop,
      exit: vi.fn(),
      readRuntimeInfo: vi.fn().mockResolvedValue({ platform: 'macos' }),
    },
  }
})
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    const set = events.get(name) ?? new Set()
    set.add(handler)
    events.set(name, set)
    return () => {
      set.delete(handler)
    }
  }),
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTheme: async () => {} }),
}))
vi.mock('@/services/records', async (original) => ({
  ...(await original<typeof import('@/services/records')>()),
  recordsApi: {
    read: vi.fn(),
    recoveries: vi.fn(),
    recovery: vi.fn(),
    begin: vi.fn(),
    end: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    export: vi.fn(),
  },
}))
vi.mock('@/services/search', async (original) => ({
  ...(await original<typeof import('@/services/search')>()),
  searchApi: { preview: vi.fn(), query: vi.fn(), calendar: vi.fn() },
}))
vi.mock('@/services/history', async (original) => ({
  ...(await original<typeof import('@/services/history')>()),
  historyApi: { history: vi.fn(), version: vi.fn(), restore: vi.fn(), mark: vi.fn() },
}))
vi.mock('@/services/trash', async (original) => ({
  ...(await original<typeof import('@/services/trash')>()),
  trashApi: { trashList: vi.fn(), trashMove: vi.fn(), trashImpact: vi.fn() },
}))
vi.mock('@/services/tags', async (original) => ({
  ...(await original<typeof import('@/services/tags')>()),
  tagsApi: { tag: vi.fn() },
}))
vi.mock('@/services/modelProfiles', async (original) => ({
  ...(await original<typeof import('@/services/modelProfiles')>()),
  modelProfilesApi: { profiles: vi.fn(), preferences: vi.fn(), models: vi.fn() },
}))
vi.mock('@/services/cli', async (original) => ({
  ...(await original<typeof import('@/services/cli')>()),
  cliApi: { scanCli: vi.fn() },
}))
vi.mock('@/services/chats', async (original) => ({
  ...(await original<typeof import('@/services/chats')>()),
  chatsApi: { chats: vi.fn(), workspace: vi.fn(), send: vi.fn() },
}))
vi.mock('@/services/diaryPreviews', async (original) => ({
  ...(await original<typeof import('@/services/diaryPreviews')>()),
  diaryPreviewsApi: { preview: vi.fn() },
}))
vi.mock('@/services/aiTasks', async (original) => ({
  ...(await original<typeof import('@/services/aiTasks')>()),
  aiTasksApi: { task: vi.fn() },
}))
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
HTMLDialogElement.prototype.showModal = function () {
  this.open = true
}
Element.prototype.scrollTo = function () {}
Element.prototype.scrollIntoView = function () {}
const original: RecordFile = {
  id: 'synthetic-entry',
  title: '合成日记',
  recordDate: '2026-10-27',
  createdTimezone: 'Asia/Shanghai',
  createdAt: 0,
  updatedAt: 0,
  contentVersion: 0,
  checkpointId: 'base',
  document: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '合成正文' }] }],
  },
  tags: [],
}
const profile: AiProfile = {
  id: 'service',
  label: '合成服务',
  service: 'custom',
  protocol: 'chat',
  baseUrl: 'https://synthetic.example/v1',
  model: 'synthetic-model',
  contextChars: 1000,
  maxOutputTokens: 100,
  downstream: null,
  codexPath: null,
}
let saved: RecordFile
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(desktop.readRuntimeInfo).mockResolvedValue({ platform: 'macos' } as Awaited<
    ReturnType<typeof desktop.readRuntimeInfo>
  >)
  events.clear()
  saved = structuredClone(original)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.mocked(recordsApi.read).mockImplementation(async (id) => {
    if (id !== saved.id) throw { code: 'not_found', message: '合成日记不存在' }
    return structuredClone(saved)
  })
  vi.mocked(searchApi.preview).mockImplementation(async (id) => ({
    id,
    kind: 'text',
    title: '合成日记',
    recordDate: original.recordDate,
    document: original.document,
    messages: [],
  }))
  vi.mocked(recordsApi.recoveries).mockResolvedValue([])
  vi.mocked(recordsApi.recovery).mockResolvedValue(null)
  vi.mocked(searchApi.query).mockResolvedValue({
    items: [{ ...original, excerpt: '合成正文', kind: 'text', hasImages: false, matchField: null }],
    total: 1,
    nextOffset: null,
    days: [],
    tags: [],
  })
  vi.mocked(recordsApi.begin).mockImplementation(async () => ({
    record: structuredClone(saved),
    sessionId: 'synthetic-session-' + saved.contentVersion,
    recovered: null,
    recoveredTags: [],
  }))
  vi.mocked(recordsApi.end).mockResolvedValue(undefined)
  vi.mocked(recordsApi.save).mockImplementation(async (input) => {
    saved = {
      ...saved,
      title: input.title,
      document: input.document,
      contentVersion: saved.contentVersion + 1,
    }
    return { ...input, contentVersion: saved.contentVersion, checkpointId: 'saved', savedAt: 1 }
  })
  vi.mocked(historyApi.history).mockResolvedValue({ items: [], nextBefore: null })
  vi.mocked(trashApi.trashList).mockResolvedValue({
    items: [],
    nextOffset: null,
    cleanupError: null,
  })
  vi.mocked(desktop.exit).mockResolvedValue(undefined)
  vi.mocked(recordsApi.export).mockResolvedValue(true)
  vi.mocked(modelProfilesApi.profiles).mockResolvedValue([profile])
  vi.mocked(modelProfilesApi.preferences).mockResolvedValue({ defaultProfileId: profile.id })
  vi.mocked(modelProfilesApi.models).mockResolvedValue(['synthetic-model'])
  vi.mocked(cliApi.scanCli).mockResolvedValue([])
  vi.mocked(chatsApi.chats).mockResolvedValue({
    items: [{ id: 'chat', title: '合成聊天', profileId: profile.id, updatedAt: 0 }],
    nextOffset: null,
  })
  vi.mocked(chatsApi.workspace).mockResolvedValue({
    id: 'chat',
    kind: 'conversation',
    title: '合成聊天',
    messages: [{ id: 'message', role: 'user', text: '合成讲述', sequence: 0 }],
    sources: [],
    related: [],
    task: null,
    profileId: profile.id,
  })
  vi.mocked(aiTasksApi.task).mockResolvedValue({
    id: 'preview',
    recordId: 'chat',
    status: 'completed',
    partial: '',
    error: null,
    resultId: null,
  })
  vi.mocked(diaryPreviewsApi.preview).mockResolvedValue({
    taskId: 'preview',
    text: '合成预览',
    title: '预览标题',
    recordDate: original.recordDate,
    mode: 'create',
    targetId: null,
    targetVersion: null,
    adoptedId: null,
  })
})
async function setup(path = '/diaries') {
  const router = createApplicationRouter([path]),
    host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  await act(async () => root.render(<App router={router} />))
  const go = async (to: string | number) =>
    act(async () => {
      if (typeof to === 'number') await router.navigate(to)
      else await router.navigate(to)
    })
  const click = async (label: string) =>
    act(async () => {
      const node = [...host.querySelectorAll<HTMLElement>('button,a')].find(
        (node) => node.getAttribute('aria-label') === label || node.textContent?.includes(label),
      )
      expect(node, label).toBeTruthy()
      node!.click()
    })
  const set = async (label: string, value: string) =>
    act(async () => {
      const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[aria-label="${label}"]`,
      )!
      expect(node, label).toBeTruthy()
      Object.getOwnPropertyDescriptor(
        node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value',
      )!.set!.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  return {
    router,
    host,
    go,
    click,
    set,
    close: async () => {
      await act(async () => root.unmount())
      router.dispose()
      host.remove()
      vi.unstubAllGlobals()
    },
  }
}
it('opens a nested history address directly, mounts only its page and returns to its retained editor session', async () => {
  const ui = await setup('/diaries/synthetic-entry/history')
  try {
    expect(ui.host.querySelector('[aria-label="日记历史与恢复"]')).toBeTruthy()
    expect(ui.host.querySelector('[aria-label="记录标题"]')).toBeNull()
    expect(recordsApi.begin).toHaveBeenCalledTimes(1)
    await ui.click('返回编辑')
    expect(ui.router.state.location.pathname).toBe('/diaries/synthetic-entry')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe(
      '合成日记',
    )
    expect(recordsApi.begin).toHaveBeenCalledTimes(1)
    await ui.go('/settings/appearance')
    expect(recordsApi.end).toHaveBeenCalledTimes(1)
  } finally {
    await ui.close()
  }
})
it('uses a single history for buttons, shortcuts, replacements and a new branch after going back', async () => {
  const ui = await setup()
  try {
    await ui.go('/chats/new')
    await ui.go('/settings/appearance')
    await ui.click('后退')
    expect(ui.router.state.location.pathname).toBe('/chats/new')
    await ui.click('前进')
    expect(ui.router.state.location.pathname).toBe('/settings/appearance')
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '[', metaKey: true, bubbles: true }),
      ),
    )
    expect(ui.router.state.location.pathname).toBe('/chats/new')
    await ui.go('/settings/trash/chat')
    expect(ui.host.querySelector<HTMLButtonElement>('button[aria-label="前进"]')!.disabled).toBe(
      true,
    )
    expect(ui.host.querySelector('[aria-label="聊天输入"]')).toBeNull()
  } finally {
    await ui.close()
  }
})
it('blocks POP on failed saves and keeps route and edits unchanged when cancelled', async () => {
  const ui = await setup()
  try {
    await ui.go('/diaries/synthetic-entry')
    await ui.set('记录标题', '未保存的合成修改')
    vi.mocked(recordsApi.save).mockRejectedValue({ code: 'storage_full', message: '合成磁盘已满' })
    await ui.go(-1)
    expect(ui.router.state.location.pathname).toBe('/diaries/synthetic-entry')
    expect(ui.host.querySelector('dialog')?.textContent).toContain('合成磁盘已满')
    await ui.click('继续编辑')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.readOnly).toBe(false)
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe(
      '未保存的合成修改',
    )
    expect(recordsApi.end).not.toHaveBeenCalled()
    vi.mocked(recordsApi.save).mockResolvedValue({
      recordId: saved.id,
      sessionId: 'synthetic-session-0',
      requestId: 'retry',
      editSequence: 1,
      contentVersion: 1,
      checkpointId: 'saved',
      savedAt: 1,
    })
    await ui.go(-1)
    expect(ui.router.state.location.pathname).toBe('/diaries')
    expect(recordsApi.end).toHaveBeenCalledTimes(1)
  } finally {
    await ui.close()
  }
})
it('rejects an unrelated preview task without showing or adopting its content', async () => {
  vi.mocked(aiTasksApi.task).mockResolvedValue({
    id: 'preview',
    recordId: 'another-chat',
    status: 'completed',
    partial: '',
    error: null,
    resultId: null,
  })
  const ui = await setup('/chats/chat/diary-preview/preview')
  try {
    expect(ui.host.textContent).toContain('预览不属于当前聊天')
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
    await ui.click('返回聊天')
    expect(ui.router.state.location.pathname).toBe('/chats/chat')
  } finally {
    await ui.close()
  }
})
it('keeps edited preview text through unmounting, settings navigation and back', async () => {
  const ui = await setup('/chats/chat/diary-preview/preview')
  try {
    await ui.set('日记预览正文', '修改后的合成预览')
    await ui.go('/settings/appearance')
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
    await ui.go(-1)
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="日记预览正文"]')!.value).toBe(
      '修改后的合成预览',
    )
    expect(recordsApi.create).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
it('keeps a new API credential only in memory across page unmounts and warns before reload', async () => {
  const ui = await setup('/settings/models/api')
  try {
    await ui.set('AI API Key', 'synthetic-not-a-real-key')
    await ui.set('AI 配置名称', '合成未保存配置')
    await ui.go('/diaries')
    expect(ui.host.querySelector('[aria-label="AI API Key"]')).toBeNull()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(JSON.stringify(ui.router.state.location)).not.toContain('synthetic-not-a-real-key')
    await ui.go('/settings/models/api')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.value).toBe(
      'synthetic-not-a-real-key',
    )
  } finally {
    await ui.close()
  }
})
it('keeps history on an uncertain restore and refuses navigation and native exit', async () => {
  const revision = {
    id: 'old',
    createdAt: 1,
    important: false,
    referenced: false,
    currentCheckpoint: false,
    restorable: true,
    restoredFromId: null,
    excerpt: '合成历史正文',
  }
  vi.mocked(historyApi.history).mockResolvedValue({ items: [revision], nextBefore: null })
  vi.mocked(historyApi.version).mockResolvedValue({
    summary: revision,
    document: original.document,
    snapshot: {
      document: original.document,
      title: '旧标题',
      recordDate: original.recordDate,
      tags: [],
    },
  })
  vi.mocked(historyApi.restore).mockRejectedValue({ message: '合成恢复结果未知' })
  const ui = await setup('/diaries/synthetic-entry/history')
  try {
    await ui.click('合成历史正文')
    await ui.click('恢复此版本')
    await ui.click('确认恢复为新版本')
    await ui.go('/settings/appearance')
    expect(ui.router.state.location.pathname).toBe('/diaries/synthetic-entry/history')
    await act(async () => {
      for (const handler of events.get('exit-requested') ?? []) handler()
    })
    expect(desktop.exit).not.toHaveBeenCalled()
    expect(recordsApi.end).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
it('shows explicit errors for unknown routes, trash domains and missing diaries without creating data', async () => {
  const ui = await setup('/unknown')
  try {
    expect(ui.host.textContent).toContain('无法打开此页面')
    await ui.go('/settings/trash/unknown')
    expect(ui.host.textContent).toContain('未知的回收站分类')
    await ui.go('/diaries/missing')
    expect(ui.host.textContent).toContain('合成日记不存在')
    expect(recordsApi.create).not.toHaveBeenCalled()
    expect(chatsApi.send).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
it('keeps API and chat drafts when a child route fails instead of unmounting the application session', async () => {
  const ui = await setup('/settings/models/api')
  try {
    await ui.set('AI API Key', 'synthetic-memory-key')
    await ui.go('/settings/trash/invalid')
    expect(ui.host.textContent).toContain('未知的回收站分类')
    await ui.go(-1)
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI API Key"]')!.value).toBe(
      'synthetic-memory-key',
    )
    await ui.go('/chats/new')
    await ui.set('聊天输入', '合成未发送草稿')
    await ui.go('/diaries/missing')
    expect(ui.host.textContent).toContain('合成日记不存在')
    await ui.go(-1)
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '合成未发送草稿',
    )
  } finally {
    await ui.close()
  }
})
it('promotes a newly sent chat with replace and never sends again on back or forward', async () => {
  vi.mocked(chatsApi.send).mockResolvedValue({
    id: 'send',
    recordId: 'chat',
    status: 'running',
    partial: '',
    error: null,
    resultId: null,
  })
  const ui = await setup()
  try {
    await ui.go('/chats/new')
    await ui.set('聊天输入', '合成第一次消息')
    await ui.click('发送消息')
    expect(ui.router.state.location.pathname).toBe('/chats/chat')
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    await ui.go(-1)
    expect(ui.router.state.location.pathname).toBe('/diaries')
    await ui.go(1)
    expect(ui.router.state.location.pathname).toBe('/chats/chat')
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    expect(recordsApi.create).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
it('retries an uncertain creation using the same envelope and does not create again from history navigation', async () => {
  vi.mocked(recordsApi.create)
    .mockRejectedValueOnce({ message: '合成创建结果未知' })
    .mockResolvedValue(original)
  const ui = await setup()
  try {
    await ui.click('新建日记')
    expect(ui.host.textContent).toContain('合成创建结果未知')
    expect(
      [...ui.host.querySelectorAll('button')].some(
        (button) => button.textContent === '重新读取配置',
      ),
    ).toBe(false)
    const first = vi.mocked(recordsApi.create).mock.calls[0]
    await ui.click('新建日记')
    expect(vi.mocked(recordsApi.create).mock.calls[1]).toEqual(first)
    expect(ui.router.state.location.pathname).toBe('/diaries/synthetic-entry')
    await ui.go(-1)
    await ui.go(1)
    expect(recordsApi.create).toHaveBeenCalledTimes(2)
  } finally {
    await ui.close()
  }
})
it('confirms native exit for unsubmitted input and flushes the diary before exiting', async () => {
  const ui = await setup('/diaries/synthetic-entry')
  try {
    await ui.set('记录标题', '关闭前的合成修改')
    await ui.go('/chats/new')
    await ui.set('聊天输入', '关闭前的未发送草稿')
    await act(async () => {
      for (const handler of events.get('exit-requested') ?? []) handler()
    })
    expect(desktop.exit).not.toHaveBeenCalled()
    expect(ui.host.querySelector('dialog')?.textContent).toContain('还有未发送或未保存')
    await ui.click('返回继续')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '关闭前的未发送草稿',
    )
    await act(async () => {
      for (const handler of events.get('exit-requested') ?? []) handler()
    })
    await ui.click('放弃这些输入并退出')
    expect(desktop.exit).toHaveBeenCalledTimes(1)
    expect(recordsApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: '关闭前的合成修改' }),
    )
  } finally {
    await ui.close()
  }
})
it('hides the previous preview while a different task is loading and rejects late unrelated content', async () => {
  const ui = await setup('/chats/chat/diary-preview/preview')
  try {
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="日记预览正文"]')!.value).toBe(
      '合成预览',
    )
    let finish!: (task: Awaited<ReturnType<typeof aiTasksApi.task>>) => void
    vi.mocked(aiTasksApi.task).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await ui.go('/chats/chat/diary-preview/foreign')
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
    await act(async () =>
      finish({
        id: 'foreign',
        recordId: 'other-chat',
        status: 'completed',
        partial: '',
        error: null,
        resultId: null,
      }),
    )
    expect(ui.host.textContent).toContain('预览不属于当前聊天')
    expect(ui.host.querySelector('[aria-label="日记预览正文"]')).toBeNull()
  } finally {
    await ui.close()
  }
})
it('serializes a native creation behind the current save and refuses competing navigation', async () => {
  let finish!: (result: Awaited<ReturnType<typeof recordsApi.save>>) => void
  vi.mocked(recordsApi.save).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  vi.mocked(recordsApi.create).mockImplementation(async () => {
    saved = { ...saved, id: 'created-entry', title: '新建合成日记' }
    return structuredClone(saved)
  })
  const ui = await setup('/diaries/synthetic-entry')
  try {
    await ui.set('记录标题', '等待保存的合成修改')
    await act(async () => {
      for (const handler of events.get('new-record-requested') ?? []) handler()
    })
    await ui.go('/settings/appearance')
    expect(ui.router.state.location.pathname).toBe('/diaries/synthetic-entry')
    expect(recordsApi.create).not.toHaveBeenCalled()
    await act(async () => {
      for (const handler of events.get('new-record-requested') ?? []) handler()
    })
    await act(async () =>
      finish({
        recordId: original.id,
        requestId: 'saved',
        sessionId: 'synthetic-session-0',
        editSequence: 1,
        contentVersion: 1,
        checkpointId: 'saved',
        savedAt: 1,
      }),
    )
    expect(recordsApi.create).toHaveBeenCalledTimes(1)
    expect(ui.router.state.location.pathname).toBe('/diaries/created-entry')
  } finally {
    await ui.close()
  }
})

it('retries a model configuration loading error without discarding the active page', async () => {
  vi.mocked(modelProfilesApi.profiles).mockRejectedValueOnce({ message: '合成配置读取失败' })
  const ui = await setup('/settings/models/api')
  try {
    expect(ui.host.textContent).toContain('合成配置读取失败')
    await ui.click('外观')
    expect(ui.host.textContent).toContain('合成配置读取失败')
    await ui.click('重新读取配置')
    expect(ui.host.textContent).not.toContain('合成配置读取失败')
    expect(ui.router.state.location.pathname).toBe('/settings/appearance')
    await ui.go('/settings/models/api')
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="AI 配置名称"]')!.disabled).toBe(
      false,
    )
  } finally {
    await ui.close()
  }
})

it('retains a queued message and input draft while chat views unmount, then dispatches once on return', async () => {
  vi.useFakeTimers()
  let server: Awaited<ReturnType<typeof chatsApi.workspace>> = {
    id: 'chat',
    kind: 'conversation',
    title: '合成聊天',
    messages: [{ id: 'message', role: 'user', text: '合成讲述', sequence: 0 }],
    sources: [],
    related: [],
    profileId: profile.id,
    task: {
      id: 'running',
      recordId: 'chat',
      status: 'running',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  vi.mocked(chatsApi.workspace).mockImplementation(async () => structuredClone(server))
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
  const ui = await setup('/chats/chat')
  try {
    await ui.set('聊天输入', '视图卸载后待发送的合成消息')
    await ui.click('发送消息')
    await ui.set('聊天输入', '继续保留的合成草稿')
    await ui.go('/settings/appearance')
    expect(ui.host.querySelector('[aria-label="聊天输入"]')).toBeNull()
    server = { ...server, task: { ...server.task!, status: 'completed' } }
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(chatsApi.send).not.toHaveBeenCalled()
    await ui.go('/chats/chat')
    expect(chatsApi.send).toHaveBeenCalledTimes(1)
    expect(chatsApi.send).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'chat', text: '视图卸载后待发送的合成消息' }),
    )
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="聊天输入"]')!.value).toBe(
      '继续保留的合成草稿',
    )
    expect(ui.host.querySelector('[aria-label="待发送消息"]')).toBeNull()
  } finally {
    await ui.close()
    vi.useRealTimers()
  }
})

it.each(['resolve', 'reject'] as const)(
  'ignores stale native callbacks and handles late subscription %s after unmount',
  async (outcome) => {
    const pending: {
      handler: () => void
      resolve: (unlisten: () => void) => void
      reject: (cause: unknown) => void
      unlisten: ReturnType<typeof vi.fn<() => void>>
    }[] = []
    const subscribe = (handler: () => void) =>
      new Promise<() => void>((resolve, reject) => {
        pending.push({ handler, resolve, reject, unlisten: vi.fn<() => void>() })
      })
    const spies = [
      vi.spyOn(recordEvents, 'onNewRequested').mockImplementation(subscribe),
      vi.spyOn(recordEvents, 'onSaveRequested').mockImplementation(subscribe),
      vi.spyOn(desktop, 'onExitRequested').mockImplementation(subscribe),
    ]
    const ui = await setup('/diaries/synthetic-entry')
    try {
      await ui.close()
      expect(pending.length).toBeGreaterThanOrEqual(3)
      await act(async () => {
        for (const subscription of pending) {
          if (outcome === 'resolve') subscription.resolve(subscription.unlisten)
          else subscription.reject(new Error('合成订阅失败'))
        }
      })
      for (const subscription of pending)
        expect(subscription.unlisten).toHaveBeenCalledTimes(outcome === 'resolve' ? 1 : 0)
      vi.mocked(recordsApi.save).mockClear()
      vi.mocked(recordsApi.create).mockClear()
      vi.mocked(desktop.exit).mockClear()
      await act(async () => {
        for (const subscription of pending) subscription.handler()
      })
      expect(recordsApi.save).not.toHaveBeenCalled()
      expect(recordsApi.create).not.toHaveBeenCalled()
      expect(desktop.exit).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  },
)

it('routes native save requests to the diary editor and ignores them on the history page', async () => {
  const ui = await setup('/diaries/synthetic-entry')
  try {
    await ui.set('记录标题', '原生保存请求的合成标题')
    await act(async () => {
      for (const handler of events.get('save-requested') ?? []) handler()
    })
    expect(recordsApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: '原生保存请求的合成标题' }),
    )
    await ui.go('/diaries/synthetic-entry/history')
    vi.mocked(recordsApi.save).mockClear()
    await act(async () => {
      for (const handler of events.get('save-requested') ?? []) handler()
    })
    expect(recordsApi.save).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
