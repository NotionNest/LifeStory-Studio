import type { AiWorkspace, ChatWindowRequest } from '@/services/chats'

export type ChatMessage = AiWorkspace['messages'][number]
export const messageCursor = ({ id, sequence }: ChatMessage) => ({ id, sequence })

// A page exchange keeps overlap for the visible anchor; database cursors remain authoritative.
export function mergeHistory(
  previous: AiWorkspace,
  incoming: AiWorkspace,
  direction: 'before' | 'after' | 'updates',
  pinned: boolean,
): AiWorkspace {
  if (previous.id !== incoming.id) return incoming
  const contiguous = !previous.page.hasAfter
  if (
    direction === 'updates' &&
    (!contiguous || (!pinned && previous.messages.length + incoming.messages.length > 300))
  ) {
    return {
      ...incoming,
      messages: previous.messages,
      page: {
        ...incoming.page,
        hasBefore: previous.page.hasBefore,
        hasAfter: previous.messages[previous.messages.length - 1]?.id !== incoming.page.latest?.id,
      },
    }
  }
  const byId = new Map(previous.messages.map((message) => [message.id, message]))
  const bySequence = new Map(previous.messages.map((message) => [message.sequence, message]))
  for (const message of incoming.messages) {
    const existing = byId.get(message.id)
    const sameSequence = bySequence.get(message.sequence)
    if (
      (existing && existing.sequence !== message.sequence) ||
      (sameSequence && sameSequence.id !== message.id)
    )
      throw new Error('聊天消息标识与顺序不一致，请重新打开聊天')
    // Immutable stored messages retain identity across overlapping page reads.
    byId.set(message.id, existing ?? message)
    bySequence.set(message.sequence, existing ?? message)
  }
  const ordered = [...byId.values()].sort((a, b) => a.sequence - b.sequence)
  const trimmed = ordered.length > 300
  const messages = direction === 'before' ? ordered.slice(0, 300) : ordered.slice(-300)
  return {
    ...incoming,
    messages,
    page: {
      ...incoming.page,
      hasBefore:
        direction === 'before' ? incoming.page.hasBefore : previous.page.hasBefore || trimmed,
      hasAfter: direction === 'before' ? previous.page.hasAfter || trimmed : incoming.page.hasAfter,
    },
  }
}

export function historyRequest(workspace: AiWorkspace): ChatWindowRequest {
  return workspace.page.latest ? { after: workspace.page.latest } : {}
}
