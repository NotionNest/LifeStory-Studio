// @vitest-environment jsdom
import { StrictMode, Suspense, act, useState, type Dispatch, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatSessionProvider, useChatView } from './ChatSessionProvider'
import { useChatSession } from './useChatSession'
vi.mock('./useChatSession', () => ({ useChatSession: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => vi.resetAllMocks())
type Session = ReturnType<typeof useChatSession>
type View = keyof Session
const names: View[] = [
  'navigation',
  'shell',
  'messages',
  'composer',
  'queue',
  'materials',
  'preview',
]
const initial = {
  text: '',
  previewText: '',
  sourceKeyword: '',
  workspace: { id: 'a' },
  pending: [],
  docked: false,
}
type State = typeof initial
function projection(state: State, sent: (text: string) => void): Session {
  // Synthetic view contracts exercise subscription boundaries; real session behavior has integration coverage.
  return {
    navigation: { previewOpen: false, diaryChatAddress: (id: string) => `/diaries/${id}` },
    shell: { title: state.workspace.id, onClose: state.docked ? () => sent('close') : undefined },
    messages: { workspace: state.workspace },
    composer: { text: state.text, send: () => sent(state.text) },
    queue: { pending: state.pending },
    materials: { sourceKeyword: state.sourceKeyword },
    preview: { previewText: state.previewText },
  } as unknown as Session
}
it('notifies only changed view subscribers and actions read the latest committed input', async () => {
  const sent = vi.fn(),
    renders = Object.fromEntries(names.map((name) => [name, 0])) as Record<View, number>
  let update!: Dispatch<SetStateAction<State>>
  let send!: Session['composer']['send']
  let close: Session['shell']['onClose']
  const pairs: string[] = []
  vi.mocked(useChatSession).mockImplementation(function useTestSession() {
    const [state, setState] = useState(initial)
    update = setState
    return projection(state, sent)
  })
  function Probe({ name }: { name: View }) {
    const view = useChatView(name)
    renders[name]++
    if (name === 'composer') send = (view as Session['composer']).send
    if (name === 'shell') close = (view as Session['shell']).onClose
    return null
  }
  function Combined() {
    const shell = useChatView('shell'),
      messages = useChatView('messages')
    pairs.push(`${shell.title}:${messages.workspace?.id}`)
    return null
  }
  const root = createRoot(document.createElement('div'))
  try {
    await act(() =>
      root.render(
        <StrictMode>
          <ChatSessionProvider>
            {names.map((name) => (
              <Probe key={name} name={name} />
            ))}
            <Combined />
          </ChatSessionProvider>
        </StrictMode>,
      ),
    )
    const before = { ...renders },
      originalSend = send
    await act(() => update((old) => ({ ...old, text: 'latest input' })))
    expect(renders.composer).toBeGreaterThan(before.composer)
    for (const name of names.filter((name) => name !== 'composer'))
      expect(renders[name]).toBe(before[name])
    expect(send).toBe(originalSend)
    await send()
    expect(sent).toHaveBeenLastCalledWith('latest input')
    const beforePreview = { ...renders }
    await act(() => update((old) => ({ ...old, previewText: 'preview draft' })))
    expect(renders.preview).toBeGreaterThan(beforePreview.preview)
    for (const name of names.filter((name) => name !== 'preview'))
      expect(renders[name]).toBe(beforePreview[name])
    const beforeMaterials = { ...renders }
    await act(() => update((old) => ({ ...old, sourceKeyword: 'search' })))
    expect(renders.materials).toBeGreaterThan(beforeMaterials.materials)
    expect(renders.messages).toBe(beforeMaterials.messages)
    await act(() => update((old) => ({ ...old, workspace: { id: 'b' }, docked: true })))
    expect(pairs).not.toContain('a:b')
    expect(pairs).not.toContain('b:a')
    expect(pairs[pairs.length - 1]).toBe('b:b')
    expect(close).toBeTypeOf('function')
    close?.()
    expect(sent).toHaveBeenLastCalledWith('close')
  } finally {
    await act(() => root.unmount())
  }
})
it('does not publish actions or snapshots from a suspended render that never commits', async () => {
  const sent = vi.fn(),
    pending = new Promise<never>(() => {})
  let send!: Session['composer']['send']
  vi.mocked(useChatSession).mockReturnValue(projection({ ...initial, text: 'committed' }, sent))
  function Probe() {
    send = useChatView('composer').send
    return <p>committed page</p>
  }
  function Paused(): never {
    throw pending
  }
  const root = createRoot(document.createElement('div'))
  try {
    await act(() =>
      root.render(
        <Suspense fallback={<p>waiting</p>}>
          <ChatSessionProvider>
            <Probe />
          </ChatSessionProvider>
        </Suspense>,
      ),
    )
    const committedSend = send
    vi.mocked(useChatSession).mockReturnValue(projection({ ...initial, text: 'uncommitted' }, sent))
    await act(() =>
      root.render(
        <Suspense fallback={<p>waiting</p>}>
          <ChatSessionProvider>
            <Paused />
            <Probe />
          </ChatSessionProvider>
        </Suspense>,
      ),
    )
    await committedSend()
    expect(sent).toHaveBeenLastCalledWith('committed')
  } finally {
    await act(() => root.unmount())
  }
})
