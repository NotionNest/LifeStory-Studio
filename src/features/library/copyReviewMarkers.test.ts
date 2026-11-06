// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { expect, it, vi } from 'vitest'
import { installReviewMarkers, setReviewMarkers } from './copyReviewMarkers'

it('marks and selects source text without changing the document, and clears stale markers on edits', () => {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions: [StarterKit], content: '<p>今天很好很好。</p>' })
  const before = editor.getJSON()
  const selected = vi.fn()
  const dispose = installReviewMarkers(editor, selected)
  try {
    setReviewMarkers(editor, [{ id: 'repeat', from: 3, to: 7, type: 'clarity', active: false }])
    const marker = element.querySelector<HTMLElement>('[data-review-id="repeat"]')!
    expect(marker.textContent).toBe('很好很好')
    expect(editor.getJSON()).toEqual(before)
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(selected).toHaveBeenCalledWith('repeat')
    editor.commands.insertContentAt(1, '新')
    expect(element.querySelector('[data-review-id]')).toBeNull()
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(before)
    setReviewMarkers(editor, [])
    expect(editor.getJSON()).toEqual(before)
  } finally {
    dispose()
    editor.destroy()
    element.remove()
  }
})
