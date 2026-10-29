import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createMemoryRouter, Outlet } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { WorkspaceTestProviders } from './WorkspaceTestProviders'
import { useDiaryActions } from '@/features/library/DiaryActions'
import { LeaveProtectionProvider } from '@/contexts/LeaveProtectionContext'
import { chatRoute, dockPath, locationPath, paths } from '@/router/paths'
import { ChatSessionProvider } from '@/features/chat/ChatSessionProvider'
import { ChatSurface } from '@/features/chat/ChatWorkspace'
import type { AiProfile, AiPreferences } from '@/services/modelProfiles'

type Props = {
  active: boolean
  profiles: AiProfile[]
  preferences: AiPreferences
  titlebarTarget?: HTMLElement | null
  sidebarOpen?: boolean
  intent?:
    | { chatId: string | null; messageId?: string; keyword?: string; nonce: number }
    | { diaryId: string; nonce: number }
    | null
  onClose?: () => void
  withSavedDiary?: (action: () => Promise<void>) => Promise<void>
  onSettings?: () => void
  onOpenDiary?: (id: string) => void
  onDirty?: (value: boolean) => void
  onBusy?: (value: boolean) => void
}
export function ChatRouteHarness(props: Props) {
  const latest = useRef(props)
  latest.current = props
  const last = useRef(paths.newChat),
    keyword = useRef(''),
    diaryChats = useRef(new Map<string, string>())
  const [router] = useState(() =>
    createMemoryRouter(
      [
        {
          Component: () => (
            <LeaveProtectionProvider>
              <Bridge getProps={() => latest.current} />
              <ChatSessionProvider>
                <Outlet />
              </ChatSessionProvider>
            </LeaveProtectionProvider>
          ),
          children: [
            { path: '/chats/*', Component: ChatSurface },
            { path: '/diaries/:recordId', Component: ChatSurface },
            { path: '*', element: <p>其他页面</p> },
          ],
        },
      ],
      { initialEntries: [paths.newChat] },
    ),
  )
  const beforeActive = useRef(true)
  useEffect(() => {
    if (!props.active) {
      if (beforeActive.current) last.current = locationPath(router.state.location)
      beforeActive.current = false
      void router.navigate('/outside')
      return
    }
    if (!beforeActive.current) {
      beforeActive.current = true
      void router.navigate(last.current)
      return
    }
    const intent = props.intent
    if (intent) {
      if ('diaryId' in intent) {
        void router.navigate(
          dockPath(intent.diaryId, diaryChats.current.get(intent.diaryId) ?? null),
        )
      } else {
        keyword.current = intent.keyword ?? ''
        void router.navigate(
          (intent.chatId ? paths.chat(intent.chatId) : paths.newChat) +
            (intent.messageId ? `?${new URLSearchParams({ message: intent.messageId })}` : ''),
        )
      }
    }
  }, [props.active, props.intent, router])
  useEffect(
    () =>
      router.subscribe((state) => {
        if (state.navigation.state !== 'idle') return
        const route = chatRoute(state.location)
        if (route.docked && route.chatId) diaryChats.current.set(route.diaryId!, route.chatId)
        if (state.location.pathname.startsWith('/settings')) latest.current.onSettings?.()
        const match = state.location.pathname.match(/^\/diaries\/([^/]+)$/)
        if (match && !state.location.search)
          latest.current.onOpenDiary?.(decodeURIComponent(match[1]))
      }),
    [router],
  )
  return (
    <WorkspaceTestProviders
      keyword={keyword}
      titlebarTarget={props.titlebarTarget}
      sidebarOpen={props.sidebarOpen}
      profiles={props.profiles}
      preferences={props.preferences}
    >
      <RouterProvider router={router} />
    </WorkspaceTestProviders>
  )
}
function Bridge({ getProps }: { getProps: () => Props }) {
  const { register } = useDiaryActions()
  const onSavedDiary = useEffectEvent(async (action: () => Promise<void>) => {
    const handle = getProps().withSavedDiary
    if (handle) await handle(action)
    else await action()
  })
  useEffect(() => register((action) => onSavedDiary(action)), [register])
  return null
}
