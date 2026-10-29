import { expect, it } from 'vitest'
import type { AiWorkspace } from '@/services/chats'
import { mergeHistory } from './chatHistory'
function window(start: number, end: number, latest = 499): AiWorkspace {
  return {
    id: 'chat',
    title: null,
    kind: 'conversation',
    sources: [],
    related: [],
    task: null,
    messages: Array.from({ length: end - start }, (_, i) => ({
      id: `m${start + i}`,
      sequence: start + i,
      role: 'user',
      text: '合成消息',
    })),
    page: {
      hasBefore: start > 0,
      hasAfter: end - 1 < latest,
      latest: { id: `m${latest}`, sequence: latest },
      hasUserText: true,
    },
  }
}
it('deduplicates overlapping pages, retains message identities and bounds both directions', () => {
  const previous = window(200, 500)
  const before = mergeHistory(previous, window(100, 250), 'before', false)
  expect(before.messages).toHaveLength(300)
  expect(before.messages[100]).toBe(previous.messages[0])
  expect(before.messages[0].sequence).toBe(100)
  expect(before.page).toMatchObject({ hasBefore: true, hasAfter: true })
  const after = mergeHistory(before, window(400, 500), 'after', false)
  expect(after.messages).toHaveLength(300)
  expect(after.messages[0].sequence).toBe(200)
  expect(after.page).toMatchObject({ hasBefore: true, hasAfter: false })
})
it('refreshes metadata and terminal state without appending across a historical gap', () => {
  const previous = window(0, 100)
  const incoming = {
    ...window(500, 501, 500),
    title: '新标题',
    sources: [
      { id: 'source', title: null, kind: 'text' as const, unavailable: true, revisionId: null },
    ],
    task: {
      id: 'task',
      recordId: 'chat',
      status: 'completed',
      partial: '',
      error: null,
      resultId: null,
    },
  }
  const result = mergeHistory(previous, incoming, 'updates', false)
  expect(result.messages).toBe(previous.messages)
  expect(result.title).toBe('新标题')
  expect(result.sources[0].unavailable).toBe(true)
  expect(result.task?.status).toBe('completed')
  expect(result.page?.hasAfter).toBe(true)
})
it('does not evict a reader at the resident limit, but follows a pinned tail', () => {
  const previous = window(200, 500)
  const incoming = window(500, 501, 500)
  expect(mergeHistory(previous, incoming, 'updates', false).messages).toBe(previous.messages)
  const followed = mergeHistory(previous, incoming, 'updates', true)
  expect(followed.messages).toHaveLength(300)
  expect(followed.messages[0].sequence).toBe(201)
  expect(followed.messages[299].sequence).toBe(500)
})
it('rejects inconsistent message IDs and sequence numbers', () => {
  const previous = window(0, 10)
  const incoming = window(9, 20)
  incoming.messages[0] = { ...incoming.messages[0], id: 'other' }
  expect(() => mergeHistory(previous, incoming, 'after', false)).toThrow('标识与顺序')
})

it('rejects conflicting sequences within a single new page', () => {
  const incoming = window(10, 20)
  incoming.messages[1] = { ...incoming.messages[1], sequence: 10 }
  expect(() => mergeHistory(window(0, 10), incoming, 'after', false)).toThrow('标识与顺序')
})
