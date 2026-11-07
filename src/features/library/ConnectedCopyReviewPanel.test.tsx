// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ConnectedCopyReviewPanel } from './ConnectedCopyReviewPanel'
import { requestCopyReview } from '@/services/copyReview'

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
vi.mock('@/components/ModelControls', () => ({
  ModelControls: ({
    onProfile,
    onSelection,
  }: {
    onProfile: (id: string) => void
    onSelection: (value: { model: string; reasoningEffort: null }) => void
  }) => (
    <button
      onClick={() => {
        onProfile('provider')
        onSelection({ model: '记住的模型', reasoningEffort: null })
      }}
    >
      审查模型
    </button>
  ),
}))
vi.mock('@/services/copyReview', () => ({ requestCopyReview: vi.fn() }))

it('sends the current text snapshot and links multiple references without automatic replacement', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({
    extensions: [StarterKit],
    content: '<p>小林来了。</p><p>小琳走了。</p>',
  })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'one',
        category: 'consistency',
        reason: '核对称谓',
        references: [
          { blockId: 'b1', quote: '小林' },
          { blockId: 'b2', quote: '小琳' },
        ],
        replacement: null,
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    expect(host.textContent).not.toContain('整篇正文 →')
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    expect(requestCopyReview).toHaveBeenCalledWith(
      'diary',
      'provider',
      null,
      expect.arrayContaining([expect.objectContaining({ id: 'b1', text: '小林来了。' })]),
      expect.any(AbortSignal),
    )
    expect(host.textContent).toContain('建议核对')
    expect(host.textContent).toContain('小林')
    expect(host.textContent).toContain('小琳')
    expect(editor.view.dom.querySelectorAll('[data-review-id="one"]')).toHaveLength(2)
    expect(host.querySelector('button[aria-label="采纳建议"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('applies a uniquely located block reference without changing matching text elsewhere', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({
    extensions: [StarterKit],
    content: '<p>很好很好。</p><p>很好很好。</p>',
  })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'one',
        category: 'repetition',
        reason: '重复',
        references: [{ blockId: 'b2', quote: '很好很好' }],
        replacement: '很好',
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    expect(editor.view.dom.querySelectorAll('[data-review-id="one"]')).toHaveLength(1)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    expect(editor.getText()).toBe('很好很好。\n\n很好。')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="撤销"]')!.click(),
    )
    expect(editor.getText()).toBe('很好很好。\n\n很好很好。')
    expect(editor.view.dom.querySelectorAll('[data-review-id="one"]')).toHaveLength(1)
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('does not apply a suggestion after formatting splits its target text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好。</p>' })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'one',
        category: 'repetition',
        reason: '重复',
        references: [{ blockId: 'b1', quote: '很好很好' }],
        replacement: '很好',
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    await act(async () => editor.chain().setTextSelection({ from: 1, to: 3 }).setBold().run())
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')?.disabled).toBe(
      true,
    )
    expect(editor.getHTML()).toContain('<strong>很好</strong>很好')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('cancels an in-flight review when the diary panel is closed', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>合成正文</p>' })
  const root = createRoot(host)
  let signal: AbortSignal | undefined
  vi.mocked(requestCopyReview).mockImplementationOnce(
    (_id, _profile, _selection, _blocks, inputSignal) => {
      signal = inputSignal
      return new Promise(() => {})
    },
  )
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    expect(signal?.aborted).toBe(false)
    await act(async () => root.unmount())
    expect(signal?.aborted).toBe(true)
  } finally {
    editor.destroy()
    host.remove()
  }
})

it('can apply and undo a suggestion to delete extra text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>今天的的天气</p>' })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'extra',
        category: 'typo',
        reason: '多字',
        references: [{ blockId: 'b1', quote: '的的' }],
        replacement: '的',
      },
      {
        id: 'suffix',
        category: 'typo',
        reason: '多字',
        references: [{ blockId: 'b1', quote: '天气' }],
        replacement: '',
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    const target = [...host.querySelectorAll('article')].find((card) =>
      card.textContent?.includes('天气'),
    )!
    await act(async () =>
      target.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    expect(editor.getText()).toBe('今天的的')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="撤销"]')!.click(),
    )
    expect(editor.getText()).toBe('今天的的天气')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('preserves neighboring rich-text formatting when applying a suggestion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({
    extensions: [StarterKit],
    content: '<p><strong>前文</strong>很好很好。</p>',
  })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'one',
        category: 'repetition',
        reason: '重复',
        references: [{ blockId: 'b1', quote: '很好很好' }],
        replacement: '很好',
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    expect(editor.getHTML()).toBe('<p><strong>前文</strong>很好。</p>')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('keeps an image and its identity unchanged when applying and undoing nearby text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const { AttachmentImageNode } = await import('./attachmentExtensions')
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({
    extensions: [StarterKit, AttachmentImageNode],
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '图片前很好很好。' }] },
        { type: 'attachmentImage', attrs: { attachmentId: 'synthetic-image' } },
        { type: 'paragraph', content: [{ type: 'text', text: '图片后觉的不错。' }] },
      ],
    },
  })
  const before = editor.getJSON()
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'typo',
        category: 'typo',
        reason: '疑似错字',
        references: [{ blockId: 'b2', quote: '觉的' }],
        replacement: '觉得',
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    const calls = vi.mocked(requestCopyReview).mock.calls
    const blocks = calls[calls.length - 1][3]
    expect(blocks.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'b1', text: '图片前很好很好。' },
      { id: 'b2', text: '图片后觉的不错。' },
    ])
    expect(JSON.stringify(blocks)).not.toContain('synthetic-image')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    expect(editor.getJSON().content?.[1]).toEqual(before.content?.[1])
    expect(editor.getText()).toContain('图片后觉得不错。')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="撤销"]')!.click(),
    )
    expect(editor.getJSON()).toEqual(before)
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('discards late results when switching diary sessions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const first = new Editor({ extensions: [StarterKit], content: '<p>第一篇觉的不错</p>' })
  const second = new Editor({ extensions: [StarterKit], content: '<p>第二篇内容</p>' })
  const root = createRoot(host)
  let finish!: (result: Awaited<ReturnType<typeof requestCopyReview>>) => void
  let signal!: AbortSignal
  vi.mocked(requestCopyReview).mockImplementationOnce(
    (_id, _profile, _selection, _blocks, selectedSignal) => {
      signal = selectedSignal
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  )
  try {
    await act(async () =>
      root.render(
        <ConnectedCopyReviewPanel key="first" editor={first} recordId="first" readOnly={false} />,
      ),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    await act(async () =>
      root.render(
        <ConnectedCopyReviewPanel
          key="second"
          editor={second}
          recordId="second"
          readOnly={false}
        />,
      ),
    )
    expect(signal.aborted).toBe(true)
    await act(async () =>
      finish({
        version: 1,
        suggestions: [
          {
            id: 'old',
            category: 'typo',
            reason: '旧建议',
            references: [{ blockId: 'b1', quote: '觉的' }],
            replacement: '觉得',
          },
        ],
      }),
    )
    expect(host.textContent).not.toContain('旧建议')
    expect(second.getText()).toBe('第二篇内容')
    expect(second.view.dom.querySelector('[data-review-id]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    first.destroy()
    second.destroy()
    host.remove()
  }
})

it('invalidates overlapping suggestions after adoption and restores them on undo', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>你好很好。</p>' })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({
    version: 1,
    suggestions: [
      {
        id: 'first',
        category: 'fluency',
        reason: '建议一',
        references: [{ blockId: 'b1', quote: '你好很' }],
        replacement: '您好',
      },
      {
        id: 'second',
        category: 'wordiness',
        reason: '建议二',
        references: [{ blockId: 'b1', quote: '很好' }],
        replacement: '好',
      },
    ],
  })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    const first = [...host.querySelectorAll('article')].find((card) =>
      card.textContent?.includes('你好很'),
    )!
    await act(async () =>
      first.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    const second = [...host.querySelectorAll('article')].find((card) =>
      card.textContent?.includes('很好'),
    )!
    expect(second.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')?.disabled).toBe(
      true,
    )
    expect(second.textContent).toContain('需重新核对')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="撤销"]')!.click(),
    )
    const restored = [...host.querySelectorAll('article')].find((card) =>
      card.textContent?.includes('很好'),
    )!
    expect(
      restored.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')?.disabled,
    ).toBe(false)
    expect(editor.getText()).toBe('你好很好。')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('remembers the selected review model after the panel is reopened', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.removeItem('lifestory.copyReview.model')
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>合成正文</p>' })
  const root = createRoot(host)
  vi.mocked(requestCopyReview).mockResolvedValueOnce({ version: 1, suggestions: [] })
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '审查模型')!
        .click(),
    )
    await act(async () => root.render(null))
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    expect(requestCopyReview).toHaveBeenLastCalledWith(
      'diary',
      'provider',
      { model: '记住的模型', reasoningEffort: null },
      expect.any(Array),
      expect.any(AbortSignal),
    )
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
    localStorage.removeItem('lifestory.copyReview.model')
  }
})

it('does not switch services when the saved service is unavailable', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.setItem(
    'lifestory.copyReview.model',
    JSON.stringify({ profileId: 'removed', selection: { model: '旧模型', reasoningEffort: null } }),
  )
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>合成正文</p>' })
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    expect(
      [...host.querySelectorAll('button')].find((button) => button.textContent === '开始审查')
        ?.disabled,
    ).toBe(true)
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
    localStorage.removeItem('lifestory.copyReview.model')
  }
})
