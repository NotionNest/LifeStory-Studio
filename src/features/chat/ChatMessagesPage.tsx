import { memo } from 'react'
import { ChatMessageList } from './ChatMessageList'
import { ChatComposer } from './ChatComposer'
export const ChatMessagesPage = memo(function ChatMessagesPage() {
  return (
    <>
      <ChatMessageList />
      <ChatComposer />
    </>
  )
})
