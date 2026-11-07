// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { recordsApi, type RecordFile, type SaveInput } from '@/services/records'
import { requestCopyReview } from '@/services/copyReview'
import { DiarySidebarContext } from '@/layouts/DiarySidebarContext'
import { RecordEditor, type EditorHandle } from './RecordEditor'

vi.mock('@/services/records', async (original) => ({
  ...(await original<typeof import('@/services/records')>()),
  recordsApi: { save: vi.fn(), end: vi.fn(), export: vi.fn() },
}))
vi.mock('@/services/tags', async (original) => ({
  ...(await original<typeof import('@/services/tags')>()),
  tagsApi: { tag: vi.fn(), tagCatalog: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/services/attachments', async (original) => ({
  ...(await original<typeof import('@/services/attachments')>()),
  attachmentsApi: { image: vi.fn().mockResolvedValue(new ArrayBuffer(4)) },
}))
vi.mock('@/contexts/ModelProfilesContext', () => ({
  useModelProfiles: () => ({
    profilesLoaded: true,
    preferences: { defaultProfileId: 'provider' },
    profiles: [
      {
        id: 'provider',
        label: '合成服务',
        protocol: 'chat',
        baseUrl: 'https://invalid.example',
        model: '合成模型',
        hasKey: true,
      },
    ],
  }),
}))
vi.mock('@/components/ModelControls', () => ({ ModelControls: () => <button>审查模型</button> }))
vi.mock('@/services/copyReview', () => ({ requestCopyReview: vi.fn() }))

it('saves an adopted correction through the diary editor without changing image references', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const clientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')
  const boundingRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  })
  URL.createObjectURL = vi.fn().mockReturnValue('blob:synthetic-image')
  URL.revokeObjectURL = vi.fn()
  const image = { type: 'attachmentImage', attrs: { attachmentId: 'synthetic-image' } }
  const record: RecordFile = {
    id: 'diary',
    title: '合成日记',
    recordDate: '2026-10-19',
    createdTimezone: 'Asia/Shanghai',
    createdAt: 1,
    updatedAt: 1,
    contentVersion: 0,
    checkpointId: 'base',
    document: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '觉的不错。' }] }, image],
    },
    tags: [],
    attachments: [],
  }
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'typo',
        category: 'typo',
        reason: '疑似错字',
        references: [{ blockId: 'b1', quote: '觉的' }],
        replacement: '觉得',
      },
    ],
  })
  vi.mocked(recordsApi.save).mockImplementation(async (input: SaveInput) => ({
    recordId: input.recordId,
    checkpointId: 'saved',
    contentVersion: input.baseContentVersion + 1,
    requestId: input.requestId,
    sessionId: input.sessionId,
    editSequence: input.editSequence,
    savedAt: 2,
  }))
  const host = document.createElement('div'),
    sidebar = document.createElement('div')
  document.body.append(host, sidebar)
  const root = createRoot(host),
    ref = createRef<EditorHandle>()
  try {
    await act(async () =>
      root.render(
        <DiarySidebarContext value={sidebar}>
          <RecordEditor
            ref={ref}
            record={record}
            sessionId="session"
            onDirty={() => {}}
            onBusy={() => {}}
            onSaved={() => {}}
            onFailure={() => {}}
          />
        </DiarySidebarContext>,
      ),
    )
    await act(async () =>
      [...sidebar.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    expect(recordsApi.save).not.toHaveBeenCalled()
    await act(async () =>
      sidebar.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    vi.mocked(recordsApi.save).mockRejectedValueOnce({
      code: 'write_failed',
      message: '合成保存失败',
    })
    await act(async () => {
      expect(await ref.current!.save()).toBe(false)
    })
    expect(host.textContent).toContain('合成保存失败')
    expect(host.textContent).toContain('觉得不错。')
    await act(async () => {
      expect(await ref.current!.save()).toBe(true)
    })
    const calls = vi.mocked(recordsApi.save).mock.calls
    expect(calls[0][0]).toEqual(calls[1][0])
    const saved = calls[calls.length - 1][0]
    expect(saved.recordId).toBe('diary')
    expect(JSON.stringify(saved.document)).toContain('觉得不错。')
    expect((saved.document as typeof record.document).content?.[1]).toEqual(image)
    await act(async () =>
      sidebar.querySelector<HTMLButtonElement>('button[aria-label="撤销"]')!.click(),
    )
    await act(async () => {
      expect(await ref.current!.save()).toBe(true)
    })
    const restored = calls[calls.length - 1][0]
    expect(JSON.stringify(restored.document)).toContain('觉的不错。')
    expect((restored.document as typeof record.document).content?.[1]).toEqual(image)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
  } finally {
    await act(async () => root.unmount())
    host.remove()
    sidebar.remove()
    if (clientRects) Object.defineProperty(Range.prototype, 'getClientRects', clientRects)
    else Reflect.deleteProperty(Range.prototype, 'getClientRects')
    if (boundingRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', boundingRect)
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  }
})
