// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { expect, it, vi } from 'vitest'
import { recordExtensions } from './recordExtensions'

function type(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, character, () =>
        editor.state.tr.insertText(character, from, to),
      ),
    )
    if (!handled) editor.commands.insertContent(character)
  }
}
it('converts typed Markdown heading, emphasis and task list syntax', () => {
  const editor = new Editor({ extensions: recordExtensions, content: '<p></p>' })
  try {
    type(editor, '# ')
    expect(editor.isActive('heading', { level: 1 })).toBe(true)
    type(editor, '**文字**')
    expect(
      editor.getJSON().content?.[0].content?.[0].marks?.some((mark) => mark.type === 'bold'),
    ).toBe(true)
    editor.commands.setContent('<p></p>')
    type(editor, '- [ ] ')
    expect(editor.isActive('taskList')).toBe(true)
    expect(editor.view.dom.querySelector('ul[data-type="taskList"] > li > div > p')).not.toBeNull()
    type(editor, '待办内容')
    expect(editor.isActive('taskItem')).toBe(true)
    expect(editor.state.selection.$from.parent.textContent).toBe('待办内容')
    editor.commands.setContent('<p></p>')
    type(editor, '[] ')
    type(editor, '直接输入')
    expect(editor.isActive('taskItem')).toBe(true)
    expect(editor.getText()).toContain('直接输入')
    editor.commands.setContent('<p></p>')
    type(editor, '- [x] ')
    expect(editor.isActive('taskItem', { checked: true })).toBe(true)
    editor.commands.setContent('<p></p>')
    type(editor, '[链接](https://example.com)')
    expect(JSON.stringify(editor.getJSON())).toContain('https://example.com')
  } finally {
    editor.destroy()
  }
})

it('keeps images when formatting is cleared', () => {
  const editor = new Editor({
    extensions: recordExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '合成文字', marks: [{ type: 'bold' }] }],
        },
        { type: 'attachmentImage', attrs: { attachmentId: 'image-id' } },
      ],
    },
  })
  try {
    editor
      .chain()
      .selectAll()
      .unsetAllMarks()
      .clearNodes()
      .updateAttributes('paragraph', { indent: 0, textAlign: null })
      .run()
    expect(JSON.stringify(editor.getJSON())).toContain('image-id')
    expect(editor.getText()).toContain('合成文字')
  } finally {
    editor.destroy()
  }
})

it('normalizes pasted named, RGB and translucent colors into storable marks', () => {
  let fillStyle = ''
  const context = {
    set fillStyle(value: string) {
      fillStyle = value
    },
    fillRect: () => {},
    getImageData: () => ({
      data: new Uint8ClampedArray(fillStyle.includes('0.5') ? [0, 0, 255, 128] : [255, 0, 0, 255]),
    }),
  }
  const mock = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const editor = new Editor({ extensions: recordExtensions, content: '<p></p>' })
  try {
    editor.commands.insertContent(
      '<p><span style="color: red; background-color: rgba(0, 0, 255, 0.5)">粘贴内容</span></p>',
    )
    const mark = editor
      .getJSON()
      .content?.flatMap((node) => node.content ?? [])
      .flatMap((node) => node.marks ?? [])
      .find((value) => value.type === 'textStyle')
    expect(mark?.attrs).toMatchObject({ color: '#ff0000', backgroundColor: '#0000ff80' })
  } finally {
    editor.destroy()
    mock.mockRestore()
  }
})
