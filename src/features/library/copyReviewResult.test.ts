// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { expect, it } from 'vitest'
import { reviewTextBlocks } from './copyReviewDocument'
import { resolveReviewResult } from './copyReviewResult'

it('keeps all references and withholds unsafe multi-reference replacements', () => {
  const editor = new Editor({
    extensions: [StarterKit],
    content: '<p>小林来了。</p><p>小琳走了。</p>',
  })
  try {
    const blocks = reviewTextBlocks(editor.state.doc)
    const [suggestion] = resolveReviewResult(editor.state.doc, blocks, {
      version: 1,
      suggestions: [
        {
          id: 'a',
          category: 'consistency',
          references: [
            { blockId: 'b1', quote: '小林' },
            { blockId: 'b2', quote: '小琳' },
          ],
          reason: '请核对称谓',
          replacement: '小林',
        },
      ],
    })
    expect(suggestion.type).toBe('建议核对')
    expect(suggestion.references.map((ref) => ref.from)).toEqual([blocks[0].from, blocks[1].from])
    expect(suggestion.replacement).toBeNull()
  } finally {
    editor.destroy()
  }
})
