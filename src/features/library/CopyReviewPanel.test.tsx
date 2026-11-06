// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CopyReviewPanel } from './CopyReviewPanel'

const suggestions = [
  { id: 'repeat', type: '重复表达', quote: '很好很好', reason: '重复', replacement: '很好' },
  { id: 'typo', type: '疑似错别字', quote: '觉的', reason: '错字', replacement: '觉得' },
]

it('keeps unaffected suggestions after editing and invalidates changed or ambiguous text', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好，觉的</p>' })
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <CopyReviewPanel
          editor={editor}
          readOnly={false}
          requestReview={async () => suggestions}
        />,
      ),
    )
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === '开始审查')!.click(),
    )
    await act(async () => vi.advanceTimersByTime(800))
    await act(async () => editor.commands.insertContentAt(editor.state.doc.content.size, '<p></p>'))
    expect(editor.view.dom.querySelector('[data-review-id="repeat"]')).not.toBeNull()
    expect(editor.view.dom.querySelector('[data-review-id="typo"]')).not.toBeNull()
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')?.disabled).toBe(
      false,
    )
    await act(async () => editor.commands.insertContentAt(2, '新'))
    expect(editor.view.dom.querySelector('[data-review-id="repeat"]')).toBeNull()
    expect(editor.view.dom.querySelector('[data-review-id="typo"]')).not.toBeNull()
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')?.disabled).toBe(
      true,
    )
    const repeatCard = [...host.querySelectorAll('article')].find((card) =>
      card.textContent?.includes('重复表达'),
    )!
    expect(repeatCard.textContent).toContain('需重新核对')
    await act(async () =>
      repeatCard.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click(),
    )
    expect(repeatCard.textContent).toContain('需重新核对')
    expect(
      repeatCard.querySelector<HTMLButtonElement>('button[aria-label="忽略建议"]')?.disabled,
    ).toBe(false)
    await act(async () =>
      editor.commands.insertContentAt(editor.state.doc.content.size, '<p>觉的</p>'),
    )
    expect(editor.view.dom.querySelector('[data-review-id="typo"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
    vi.useRealTimers()
  }
})

it('undoes and redoes an adopted suggestion without undoing the preceding edit', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好，觉的</p>' })
  const root = createRoot(host)
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  try {
    await act(async () =>
      root.render(
        <CopyReviewPanel
          editor={editor}
          readOnly={false}
          requestReview={async () => suggestions}
        />,
      ),
    )
    expect(host.querySelector('button[aria-label="撤销"]')).toBeNull()
    await act(async () => {
      editor.commands.insertContentAt(5, '！')
    })
    await act(async () =>
      [...host.querySelectorAll('button')].find((item) => item.textContent === '开始审查')!.click(),
    )
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(host.textContent).toContain('重复表达')
    expect(host.textContent).toContain('疑似错别字')
    const typoCard = [...host.querySelectorAll('article')].find((card) =>
      card.textContent?.includes('疑似错别字'),
    )!
    const scroll = vi.fn()
    typoCard.scrollIntoView = scroll
    await act(async () => {
      editor.view.dom
        .querySelector('[data-review-id="typo"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(typoCard.querySelector('button[aria-expanded="true"]')).not.toBeNull()
    expect(scroll).toHaveBeenCalled()
    await act(async () => button('采纳建议').click())
    expect(editor.getText()).toBe('很好！，觉的')
    expect(host.textContent).not.toContain('重复表达')
    expect(host.textContent).toContain('疑似错别字')
    expect(editor.view.dom.querySelector('[data-review-id="typo"]')).not.toBeNull()
    await act(async () => button('撤销').click())
    expect(editor.getText()).toBe('很好很好！，觉的')
    expect(host.textContent).toContain('重复表达')
    expect(editor.view.dom.querySelector('[data-review-id="repeat"]')).not.toBeNull()
    expect(button('重做').disabled).toBe(false)
    await act(async () => button('重做').click())
    expect(editor.getText()).toBe('很好！，觉的')
    expect(host.textContent).not.toContain('重复表达')
    expect(host.textContent).toContain('疑似错别字')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
    vi.useRealTimers()
  }
})

it('does not start a review before the service is connected', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>合成文字</p>' })
  const root = createRoot(host)
  try {
    await act(async () => root.render(<CopyReviewPanel editor={editor} readOnly={false} />))
    const button = [...host.querySelectorAll('button')].find(
      (item) => item.textContent === '开始审查',
    )!
    expect(button.disabled).toBe(true)
    expect(host.textContent).toContain('审查服务尚未接入')
    expect(host.textContent).not.toContain('模拟状态')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('discards results that arrive after stopping', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好</p>' })
  const root = createRoot(host)
  let finish!: (value: typeof suggestions) => void
  const requestReview = vi.fn(
    () =>
      new Promise<typeof suggestions>((resolve) => {
        finish = resolve
      }),
  )
  try {
    await act(async () =>
      root.render(
        <CopyReviewPanel editor={editor} readOnly={false} requestReview={requestReview} />,
      ),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '停止审查')!
        .click(),
    )
    await act(async () => finish(suggestions))
    expect(host.textContent).toContain('审查已停止')
    expect(host.textContent).not.toContain('重复表达')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('keeps ignored suggestions ignored when unrelated edits are undone', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好，觉的</p>' })
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <CopyReviewPanel
          editor={editor}
          readOnly={false}
          requestReview={async () => suggestions}
        />,
      ),
    )
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === '开始审查')!.click(),
    )
    await act(async () =>
      editor.commands.insertContentAt(editor.state.doc.content.size, '<p>新</p>'),
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="忽略建议"]')!.click(),
    )
    await act(async () => editor.commands.undo())
    expect(host.textContent).not.toContain('重复表达')
    expect(host.textContent).toContain('疑似错别字')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('maps each suggestion through edits made while the review runs', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好，觉的</p>' })
  const root = createRoot(host)
  let finish!: (value: typeof suggestions) => void
  const requestReview = () =>
    new Promise<typeof suggestions>((resolve) => {
      finish = resolve
    })
  try {
    await act(async () =>
      root.render(
        <CopyReviewPanel editor={editor} readOnly={false} requestReview={requestReview} />,
      ),
    )
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === '开始审查')!.click(),
    )
    await act(async () => editor.commands.insertContentAt(2, '新'))
    await act(async () =>
      editor.commands.insertContentAt(editor.state.doc.content.size, '<p>结尾</p>'),
    )
    await act(async () => finish(suggestions))
    expect(editor.view.dom.querySelector('[data-review-id="repeat"]')).toBeNull()
    expect(editor.view.dom.querySelector('[data-review-id="typo"]')).not.toBeNull()
    expect(host.textContent).toContain('需重新核对')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})

it('shows the actual review failure and permits retry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>很好很好</p>' })
  const root = createRoot(host)
  const requestReview = vi
    .fn()
    .mockRejectedValueOnce({ message: '正文超出长度限制' })
    .mockResolvedValueOnce([])
  try {
    await act(async () =>
      root.render(
        <CopyReviewPanel editor={editor} readOnly={false} requestReview={requestReview} />,
      ),
    )
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === '开始审查')!.click(),
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('正文超出长度限制')
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === '重试')!.click(),
    )
    expect(host.textContent).toContain('未发现建议')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})
