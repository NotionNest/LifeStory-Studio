import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Context } from './shim'
import { ChatMessageList } from '@/features/chat/ChatMessageList'
import { ChatMessageList as Prototype } from './MessageListPrototype'
import '@/styles/globals.css'
const root = createRoot(document.querySelector('#root')!)
const noop = () => {}
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
const view = (w: any) => ({
  id: w.id,
  workspace: w,
  task: w.task,
  running: true,
  busy: false,
  location: null,
  located: noop,
  missing: noop,
  followLatest: noop,
  resetLocation: noop,
  retrySave: noop,
})
let prototype = false
const mount = (w: any) =>
  flushSync(() =>
    root.render(
      <Context value={view(w)}>
        <div style={{ height: '800px', width: '1000px', display: 'flex' }}>
          {prototype ? <Prototype /> : <ChatMessageList />}
        </div>
      </Context>,
    ),
  )
window.bench = async (count: number, chars = 1024, policy = 'full') => {
  prototype = policy.includes('memo')
  flushSync(() => root.render(null))
  await frames()
  const text = '合成测试内容。'.repeat(Math.ceil(chars / 7)).slice(0, chars)
  const data = {
    id: 'synthetic-chat',
    title: 'Synthetic',
    kind: 'conversation',
    sources: [],
    related: [],
    task: { id: 'synthetic-task', status: 'running', partial: '生成中', startedAt: Date.now() },
    messages: Array.from({ length: count }, (_, i) => ({
      id: 'm' + i,
      role: i % 2 ? 'assistant' : 'user',
      sequence: i,
      text,
      createdAt: 1,
    })),
  }
  if (policy.startsWith('page')) data.messages = data.messages.slice(-100)
  const rendered = data.messages.length
  const payload = JSON.stringify(data),
    bytes = new TextEncoder().encode(payload).length
  const parses = []
  let w: any
  for (let i = 0; i < 5; i++) {
    const t = performance.now()
    w = JSON.parse(payload)
    parses.push(performance.now() - t)
  }
  const start = performance.now()
  mount(w)
  const mountWorkMs = performance.now() - start
  await frames()
  const mountMs = performance.now() - start
  const nodes = document.querySelectorAll('*').length,
    updates = [],
    work = []
  if (nodes < rendered * 5) throw new Error('Message view failed to render: ' + nodes)
  for (let i = 0; i < 3; i++) {
    w =
      policy === 'full'
        ? JSON.parse(payload)
        : { ...w, task: { ...w.task, partial: w.task.partial + ' ' + i } }
    const t = performance.now()
    mount(w)
    work.push(performance.now() - t)
    await frames()
    updates.push(performance.now() - t)
  }
  return {
    count,
    rendered,
    policy,
    chars,
    bytes,
    updateBytes:
      policy === 'full' ? bytes : new TextEncoder().encode(JSON.stringify(w.task)).length,
    mountWorkMs,
    mountMs,
    updateWorkMs: work,
    updateMs: updates,
    parseMs: parses,
    domNodes: nodes,
    heapBytes: performance.memory?.usedJSHeapSize,
  }
}
