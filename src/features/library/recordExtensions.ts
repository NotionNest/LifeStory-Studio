import { Extension, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { AttachmentImageNode } from './attachmentExtensions'

// Canvas resolves browser-supported CSS colors into the editor's persisted sRGB format.
function normalizedColor(value: string): string | null {
  if (!value) return null
  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) return value.toLowerCase()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法解析文字颜色')
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const rgba = context.getImageData(0, 0, 1, 1).data
  const length = rgba[3] === 255 ? 3 : 4
  return `#${Array.from(rgba.slice(0, length), (channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
const StoredColor = Color.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((group) => ({
      ...group,
      attributes: {
        ...group.attributes,
        color: {
          ...group.attributes.color,
          parseHTML: (element: HTMLElement) => normalizedColor(element.style.color),
        },
      },
    }))
  },
})
const StoredBackgroundColor = BackgroundColor.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((group) => ({
      ...group,
      attributes: {
        ...group.attributes,
        backgroundColor: {
          ...group.attributes.backgroundColor,
          parseHTML: (element: HTMLElement) => normalizedColor(element.style.backgroundColor),
        },
      },
    }))
  },
})

const Indentation = Extension.create({
  name: 'indentation',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute('data-indent')) || 0,
            renderHTML: (attributes) =>
              attributes.indent
                ? {
                    'data-indent': attributes.indent,
                    style: `margin-left: ${attributes.indent * 2}em`,
                  }
                : {},
          },
        },
      },
    ]
  },
})
const MarkdownTaskInput = Extension.create({
  name: 'markdownTaskInput',
  addInputRules() {
    return [
      new InputRule({
        find: /^\[([ xX])\]\s$/,
        handler: ({ range, match, chain }) => {
          if (!this.editor.isActive('bulletList')) return null
          const action = chain().deleteRange(range).setTextSelection(range.from).toggleTaskList()
          if (match[1].toLowerCase() === 'x') action.updateAttributes('taskItem', { checked: true })
          action.run()
        },
      }),
    ]
  },
})
export const recordExtensions = [
  StarterKit.configure({
    link: {
      markdownLinks: true,
      autolink: false,
      linkOnPaste: false,
      openOnClick: false,
      isAllowedUri: (url) => /^https?:\/\/[^\s]+$/i.test(url),
      HTMLAttributes: { target: null, rel: null, class: null },
    },
  }),
  AttachmentImageNode,
  TextStyle,
  StoredColor,
  StoredBackgroundColor,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  MarkdownTaskInput,
  Indentation,
]
