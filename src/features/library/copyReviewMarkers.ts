import type { useEditor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

type Editor = NonNullable<ReturnType<typeof useEditor>>
export interface ReviewMarker {
  id: string
  from: number
  to: number
  type: string
  active: boolean
}
const key = new PluginKey<DecorationSet>('copyReviewMarkers')
export function installReviewMarkers(editor: Editor, onSelect: (id: string) => void) {
  editor.registerPlugin(
    new Plugin({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, previous) => {
          const markers = tr.getMeta(key) as ReviewMarker[] | undefined
          if (markers)
            return DecorationSet.create(
              tr.doc,
              markers.map((marker) =>
                Decoration.inline(marker.from, marker.to, {
                  class: `copy-review-mark copy-review-mark--${marker.type}${marker.active ? ' is-active' : ''}`,
                  'data-review-id': marker.id,
                }),
              ),
            )
          return tr.docChanged ? DecorationSet.empty : previous
        },
      },
      props: {
        decorations: (state) => key.getState(state),
        handleDOMEvents: {
          click: (_view, event) => {
            const element =
              event.target instanceof Element ? event.target.closest('[data-review-id]') : null
            const id = element?.getAttribute('data-review-id')
            if (id) onSelect(id)
            return false
          },
        },
      },
    }),
  )
  return () => {
    editor.unregisterPlugin(key)
  }
}
export function setReviewMarkers(editor: Editor, markers: ReviewMarker[]) {
  editor.view.dispatch(editor.state.tr.setMeta(key, markers).setMeta('addToHistory', false))
}
