import type { JSONContent } from '@tiptap/react'
export function imageIds(document: JSONContent): string[] {
  const ids = new Set<string>()
  const walk = (node: JSONContent) => { if (node.type === 'attachmentImage' && typeof node.attrs?.attachmentId === 'string') ids.add(node.attrs.attachmentId); node.content?.forEach(walk) }
  walk(document); return [...ids]
}
