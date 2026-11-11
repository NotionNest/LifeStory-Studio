// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ColorPalette } from './ColorPalette'
import { recordExtensions } from './recordExtensions'

it('applies and clears text color without losing the selected text', async () => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const editor = new Editor({ extensions: recordExtensions, content: '<p>合成文字</p>' })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function App() {
    const state = useEditorState({
      editor,
      selector: ({ editor }) => ({
        color: (editor.getAttributes('textStyle').color as string | null) ?? null,
        background: (editor.getAttributes('textStyle').backgroundColor as string | null) ?? null,
      }),
    })
    return (
      <>
        <ColorPalette editor={editor} kind="text" color={state.color} disabled={false} />
        <ColorPalette editor={editor} kind="background" color={state.background} disabled={false} />
      </>
    )
  }
  try {
    editor.commands.setTextSelection({ from: 1, to: 5 })
    await act(async () => root.render(<App />))
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="文字颜色"]')!.click())
    expect(document.querySelectorAll('[aria-label="文字颜色：中性色"] button')).toHaveLength(6)
    expect(document.querySelectorAll('[aria-label="文字颜色：暖色"] button')).toHaveLength(6)
    expect(document.querySelectorAll('[aria-label="文字颜色：冷色"] button')).toHaveLength(6)
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="蓝色 #285ac4"]')!.click(),
    )
    expect(
      editor
        .getJSON()
        .content?.[0].content?.[0].marks?.some(
          (mark) => mark.type === 'textStyle' && mark.attrs?.color === '#285ac4',
        ),
    ).toBe(true)
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="文字颜色"]')!.click())
    expect(
      document.querySelector('[aria-label="蓝色 #285ac4"]')?.getAttribute('aria-pressed'),
    ).toBe('true')
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="默认颜色"]')!.click(),
    )
    expect(
      editor.getJSON().content?.[0].content?.[0].marks?.some((mark) => mark.type === 'textStyle'),
    ).not.toBe(true)
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="背景颜色"]')!.click())
    expect(document.querySelectorAll('[aria-label="背景颜色：中性色"] button')).toHaveLength(6)
    expect(document.querySelectorAll('[aria-label="背景颜色：暖色"] button')).toHaveLength(6)
    expect(document.querySelectorAll('[aria-label="背景颜色：冷色"] button')).toHaveLength(6)
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="浅黄 #fef08a"]')!.click(),
    )
    expect(
      editor
        .getJSON()
        .content?.[0].content?.[0].marks?.some((mark) => mark.attrs?.backgroundColor === '#fef08a'),
    ).toBe(true)
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="背景颜色"]')!.click())
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="清除背景色"]')!.click(),
    )
    expect(
      editor.getJSON().content?.[0].content?.[0].marks?.some((mark) => mark.attrs?.backgroundColor),
    ).not.toBe(true)
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
    vi.unstubAllGlobals()
  }
})
