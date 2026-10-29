// @vitest-environment jsdom
import { recordsApi, type RecordFile } from '@/services/records'
import { attachmentsApi } from '@/services/attachments'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { DiaryRouteHarness } from '@/test/DiaryRouteHarness'
vi.mock('@/services/desktop', async (original) => ({
  ...(await original<typeof import('@/services/desktop')>()),
  desktopAvailable: true,
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))
vi.mock('@/services/records', async (original) => ({
  ...(await original<typeof import('@/services/records')>()),
  recordsApi: {
    recoveries: vi.fn(),
    recovery: vi.fn(),
    begin: vi.fn(),
    end: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    export: vi.fn(),
  },
}))
vi.mock('@/services/search', async (original) => ({
  ...(await original<typeof import('@/services/search')>()),
  searchApi: {
    query: vi.fn(async (query: { offset: number }) => {
      const rows = await recordsApi.list(query.offset)
      return {
        items: (rows ?? []).map((item) => ({
          ...item,
          kind: 'text',
          tags: [],
          hasImages: false,
          matchField: null,
        })),
        total: rows?.length ?? 0,
        nextOffset: null,
        days: [],
        tags: [],
      }
    }),
    preview: vi.fn(),
  },
}))
vi.mock('@/services/tags', async (original) => ({
  ...(await original<typeof import('@/services/tags')>()),
  tagsApi: { tag: vi.fn() },
}))
vi.mock('@/services/attachments', async (original) => ({
  ...(await original<typeof import('@/services/attachments')>()),
  attachmentsApi: { importImage: vi.fn(), image: vi.fn(), copyImage: vi.fn() },
}))
const empty: RecordFile = {
  id: 'images',
  title: '合成图片记录',
  recordDate: '2026-10-19',
  createdTimezone: 'Asia/Shanghai',
  createdAt: 1,
  updatedAt: 1,
  contentVersion: 0,
  checkpointId: 'base',
  document: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '原始文字' }] }],
  },
  tags: [],
  attachments: [],
}
let current: RecordFile, sequence: number
beforeEach(() => {
  vi.clearAllMocks()
  current = structuredClone(empty)
  sequence = 0
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.elementFromPoint = vi.fn().mockReturnValue(null)
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  URL.createObjectURL = vi.fn().mockReturnValue('blob:synthetic-image')
  URL.revokeObjectURL = vi.fn()
  vi.mocked(recordsApi.recoveries).mockResolvedValue([])
  vi.mocked(recordsApi.recovery).mockResolvedValue(null)
  vi.mocked(recordsApi.list).mockImplementation(async () => [
    { id: current.id, title: current.title, recordDate: current.recordDate, excerpt: '' },
  ])
  vi.mocked(recordsApi.read).mockImplementation(async () => structuredClone(current))
  vi.mocked(recordsApi.begin).mockImplementation(async () => ({
    record: structuredClone(current),
    sessionId: `session-${sequence}`,
    recovered: null,
    recoveredTags: [],
  }))
  vi.mocked(attachmentsApi.image).mockResolvedValue(new ArrayBuffer(4))
  vi.mocked(recordsApi.save).mockImplementation(async (input) => {
    current = {
      ...current,
      title: input.title,
      document: input.document,
      contentVersion: current.contentVersion + 1,
    }
    return {
      recordId: current.id,
      checkpointId: 'base',
      contentVersion: current.contentVersion,
      requestId: input.requestId,
      sessionId: input.sessionId,
      editSequence: input.editSequence,
      savedAt: 2,
    }
  })
  vi.mocked(attachmentsApi.importImage).mockImplementation(async (op, file, document) => {
    sequence++
    const attachment = {
      id: `image-${sequence}`,
      name: file.name,
      mediaType: 'image/png',
      byteLength: 8,
      width: 8,
      height: 6,
    }
    current = {
      ...current,
      document: JSON.parse(JSON.stringify(document).split(op.requestId).join(`image-${sequence}`)),
      attachments: [...(current.attachments ?? []), attachment],
      contentVersion: current.contentVersion + 1,
    }
    return {
      editing: {
        record: structuredClone(current),
        sessionId: `session-${sequence}`,
        recovered: null,
        recoveredTags: [],
      },
      attachmentId: attachment.id,
    }
  })
})
function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const click = (text: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === text || b.textContent?.includes(text),
    )
    expect(button).toBeTruthy()
    button!.click()
  }
  return { host, root, click }
}
async function open(t: ReturnType<typeof setup>) {
  await act(async () => t.root.render(<DiaryRouteHarness />))
  await act(async () => t.click('合成图片记录'))
}
it('picker, drop and paste all insert in the document; a failed item does not duplicate successes', async () => {
  const t = setup()
  try {
    await open(t)
    const good = new File(['synthetic'], '好图.png', { type: 'image/png' }),
      bad = new File(['bad'], '坏图.gif', { type: 'image/gif' })
    vi.mocked(attachmentsApi.importImage).mockRejectedValueOnce({
      code: 'validation',
      message: '不支持格式',
    })
    await act(async () => {
      const input = t.host.querySelector<HTMLInputElement>('input[type="file"]')!
      Object.defineProperty(input, 'files', { configurable: true, value: [bad, good] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(attachmentsApi.importImage).toHaveBeenCalledTimes(2)
    expect(t.host.textContent).toContain('未成功：坏图.gif')
    expect(t.host.querySelectorAll('[aria-label="查看正文原图"]')).toHaveLength(1)
    expect(t.host.textContent).not.toContain('附件回收区')
    expect(t.host.textContent).not.toContain('引用选中文字')
    const event = (type: string, files: File[]) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, type === 'paste' ? 'clipboardData' : 'dataTransfer', {
        value: { files, types: ['Files'] },
      })
      return e
    }
    await act(async () => {
      t.host.querySelector('[aria-label="记录正文"]')!.dispatchEvent(event('drop', [good]))
    })
    expect(t.host.querySelectorAll('[aria-label="查看正文原图"]')).toHaveLength(2)
    await act(async () => {
      t.host.querySelector('[aria-label="记录正文"]')!.dispatchEvent(event('paste', [good]))
    })
    expect(attachmentsApi.importImage).toHaveBeenCalledTimes(4)
    expect(t.host.querySelectorAll('[aria-label="查看正文原图"]')).toHaveLength(3)
    expect(t.host.querySelector('[aria-label="记录正文"]')!.textContent).toContain('原始文字')
  } finally {
    await act(async () => t.root.unmount())
    t.host.remove()
  }
})
it('preserves undo across imports and automatic persistence, with document-owned attachment IDs', async () => {
  const t = setup()
  try {
    await open(t)
    await act(async () => {
      const input = t.host.querySelector('input[type="file"]')!
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], '图片.png')],
        configurable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const body = t.host.querySelector('[aria-label="记录正文"]')!
    await act(async () => t.click('移除图片'))
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }),
      ),
    )
    expect(recordsApi.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ attachmentIds: [], sessionId: 'session-1' }),
    )
    await act(async () =>
      body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true }),
      ),
    )
    expect(t.host.querySelector('[aria-label="查看正文原图"]')).toBeTruthy()
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }),
      ),
    )
    expect(recordsApi.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ attachmentIds: ['image-1'] }),
    )
  } finally {
    await act(async () => t.root.unmount())
    t.host.remove()
  }
})
it('keeps unsaved text when saving fails and sends no attachment mutation', async () => {
  const t = setup()
  try {
    await open(t)
    vi.mocked(recordsApi.save).mockRejectedValue({ code: 'storage_full', message: '合成磁盘满' })
    await act(async () => {
      const input = t.host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '未保存标题',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      const picker = t.host.querySelector('input[type="file"]')!
      Object.defineProperty(picker, 'files', {
        value: [new File(['x'], '图片.png')],
        configurable: true,
      })
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(attachmentsApi.importImage).not.toHaveBeenCalled()
    expect(t.host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe(
      '未保存标题',
    )
    expect(t.host.textContent).toContain('尚未导入')
  } finally {
    await act(async () => t.root.unmount())
    t.host.remove()
  }
})
it('copies a historical image through the scoped desktop clipboard command', async () => {
  const { AttachmentSurface, ImageViewer } =
    await import('@/components/attachments/AttachmentImage')
  const t = setup()
  try {
    vi.mocked(attachmentsApi.copyImage).mockResolvedValue()
    await act(async () =>
      t.root.render(
        <AttachmentSurface scope={{ recordId: 'images', revisionId: 'old-version' }}>
          <ImageViewer attachmentId="image-1" onClose={() => {}} />
        </AttachmentSurface>,
      ),
    )
    await act(async () => t.click('复制图片'))
    expect(attachmentsApi.copyImage).toHaveBeenCalledWith('images', 'image-1', 'old-version')
    expect(t.host.textContent).toContain('图片已复制')
  } finally {
    await act(async () => t.root.unmount())
    t.host.remove()
  }
})

it('reconciles an uncertain import without offering to duplicate that image', async () => {
  const t = setup()
  try {
    await open(t)
    vi.mocked(attachmentsApi.importImage).mockRejectedValueOnce(new Error('合成回执丢失'))
    await act(async () => {
      const input = t.host.querySelector('input[type="file"]')!
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], '不确定图片.png')],
        configurable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(attachmentsApi.importImage).toHaveBeenCalledTimes(1)
    expect(t.host.textContent).toContain('结果尚未确认')
    expect(t.host.textContent).not.toContain('重试未成功图片')
    expect(recordsApi.read).toHaveBeenCalled()
  } finally {
    await act(async () => t.root.unmount())
    t.host.remove()
  }
})
