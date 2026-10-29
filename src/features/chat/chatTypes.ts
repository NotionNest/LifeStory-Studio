import { chatsApi } from '@/services/chats'
export type MessageLocation = {
  messageId: string
  keyword: string
  nonce: number
  located?: boolean
  follow?: boolean
}
export type PreviewMode = 'create' | 'append' | 'rewrite'
export type QueuedMessage = {
  editingText?: string
  recordId: string
  input: Parameters<typeof chatsApi.send>[0]
  paused?: boolean
  error?: string
  continueAfterFailure?: boolean
}
