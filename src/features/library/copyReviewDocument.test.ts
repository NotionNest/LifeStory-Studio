// @vitest-environment jsdom
import { Editor, Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { expect, it } from 'vitest'
import { resolveReviewReferences, reviewTextBlocks } from './copyReviewDocument'

it('captures formatted text, line breaks and UTF-16 positions without image data', () => {
  const Image = Node.create({
    name: 'testImage',
    inline: true,
    group: 'inline',
    atom: true,
    renderHTML: () => ['img'],
  })
  const editor = new Editor({
    extensions: [StarterKit, Image],
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '你好😀' },
            { type: 'text', text: '世界', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: '继续' },
            { type: 'testImage' },
            { type: 'text', text: '图片之后' },
          ],
        },
      ],
    },
  })
  try {
    const blocks = reviewTextBlocks(editor.state.doc)
    expect(blocks.map(({ text }) => text)).toEqual(['你好😀世界\n继续', '图片之后'])
    for (const block of blocks)
      expect(editor.state.doc.textBetween(block.from, block.to, '', '\n')).toBe(block.text)
  } finally {
    editor.destroy()
  }
})

it('resolves repeated text within its own block and refuses ambiguous or cross-format replacement', () => {
  const editor = new Editor({
    extensions: [StarterKit],
    content: '<p>很好很好</p><p>很好<strong>很好</strong></p><p>很好很好</p>',
  })
  try {
    const blocks = reviewTextBlocks(editor.state.doc)
    const resolved = resolveReviewReferences(editor.state.doc, blocks, [
      { blockId: 'b1', quote: '很好很好' },
      { blockId: 'b2', quote: '很好很好' },
    ])
    expect(resolved.map((item) => item.from)).toEqual([blocks[0].from, blocks[1].from])
    expect(resolved.every((item) => !item.replaceable)).toBe(true)
    const acrossMarks = resolveReviewReferences(editor.state.doc, blocks, [
      { blockId: 'b2', quote: '很好很好' },
    ])[0]
    expect(acrossMarks.from).toBe(blocks[1].from)
    expect(acrossMarks.replaceable).toBe(false)
    const ambiguous = resolveReviewReferences(editor.state.doc, blocks, [
      { blockId: 'b1', quote: '很好' },
    ])[0]
    expect(ambiguous.from).toBeNull()
    expect(ambiguous.replaceable).toBe(false)
    expect(
      resolveReviewReferences(editor.state.doc, blocks, [{ blockId: 'b3', quote: '很好很好' }])[0]
        .replaceable,
    ).toBe(true)
    editor.commands.insertContentAt(blocks[0].from + 1, '新')
    expect(
      resolveReviewReferences(editor.state.doc, blocks, [{ blockId: 'b1', quote: '很好很好' }])[0]
        .from,
    ).toBeNull()
  } finally {
    editor.destroy()
  }
})
