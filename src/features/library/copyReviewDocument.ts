import type { Node as DocumentNode } from '@tiptap/pm/model'

export interface ReviewTextBlock {
  id: string
  text: string
  from: number
  to: number
}

/** Capture only text and hard breaks; inline objects separate independently addressable ranges. */
export function reviewTextBlocks(doc: DocumentNode): ReviewTextBlock[] {
  const blocks: ReviewTextBlock[] = []
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true
    let text = ''
    let start = position + 1
    const flush = () => {
      if (text)
        blocks.push({ id: `b${blocks.length + 1}`, text, from: start, to: start + text.length })
      text = ''
    }
    node.forEach((child, offset) => {
      if (child.isText || child.type.name === 'hardBreak') {
        if (!text) start = position + 1 + offset
        text += child.isText ? child.text : '\n'
      } else {
        flush()
      }
    })
    flush()
    if (node.childCount === 0)
      blocks.push({ id: `b${blocks.length + 1}`, text: '', from: position + 1, to: position + 1 })
    return false
  })
  return blocks
}

export interface ReviewReference {
  blockId: string
  quote: string
}
export interface ResolvedReviewReference extends ReviewReference {
  from: number | null
  to: number | null
  replaceable: boolean
}

/** A reference is usable only if it occurs exactly once in its original text block. */
export function resolveReviewReferences(
  doc: DocumentNode,
  blocks: ReviewTextBlock[],
  references: ReviewReference[],
): ResolvedReviewReference[] {
  const byId = new Map(blocks.map((block) => [block.id, block]))
  return references.map((reference) => {
    const block = byId.get(reference.blockId)
    const offset = block?.text.indexOf(reference.quote) ?? -1
    if (
      !block ||
      !reference.quote ||
      offset < 0 ||
      block.text.indexOf(reference.quote, offset + 1) >= 0
    ) {
      return { ...reference, from: null, to: null, replaceable: false }
    }
    const from = block.from + offset
    const to = from + reference.quote.length
    if (to > doc.content.size || doc.textBetween(from, to, '', '\n') !== reference.quote) {
      return { ...reference, from: null, to: null, replaceable: false }
    }
    let containingText = false
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isText && pos <= from && pos + node.nodeSize >= to) containingText = true
    })
    return { ...reference, from, to, replaceable: references.length === 1 && containingText }
  })
}
