import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { createMemoryRouter, Outlet, useLocation, useNavigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ChatSessionProvider } from '@/features/chat/ChatSessionProvider'
import { LeaveProtectionProvider, useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { WorkspaceTestProviders } from './WorkspaceTestProviders'
import { useDiaryActions } from '@/features/library/DiaryActions'
import { paths, locationPath } from '@/router/paths'
import { DiaryCreationProvider } from '@/features/library/DiaryCreation'
import { DiaryBrowserProvider } from '@/features/library/DiaryBrowserSession'
import { DiaryHomePage } from '@/features/library/DiaryHomePage'
import { DiaryDetailLayout } from '@/features/library/DiaryDetailLayout'
import { DiaryEditorPage } from '@/features/library/DiaryEditorPage'
import { DiaryHistoryPage } from '@/features/library/DiaryHistoryPage'
import { diaryLoader } from '@/features/library/diaryLoader'
import { RouteErrorPage } from '@/router/RouteError'

export interface DiaryTestActions {
  go: (to: string, state?: { returnTo: string }) => Promise<void>
  afterHomeNavigation: (action: () => void) => void
  withSavedDiary: (action: () => Promise<void>) => Promise<void>
}
type Props = {
  titlebarTarget?: HTMLElement | null
  ref?: Ref<DiaryTestActions>
  onLocation?: (address: string) => void
}
export function DiaryRouteHarness(props: Props) {
  const latest = useRef(props)
  latest.current = props
  const keyword = useRef('')
  const [router] = useState(() =>
    createMemoryRouter(
      [
        {
          Component: () => (
            <LeaveProtectionProvider>
              <DiaryTestControls getProps={() => latest.current} />
              <DiaryCreationProvider>
                <DiaryBrowserProvider>
                  <ChatSessionProvider>
                    <Outlet />
                  </ChatSessionProvider>
                </DiaryBrowserProvider>
              </DiaryCreationProvider>
            </LeaveProtectionProvider>
          ),
          children: [
            { path: '/diaries', Component: DiaryHomePage },
            {
              path: '/diaries/:recordId',
              loader: diaryLoader,
              Component: DiaryDetailLayout,
              ErrorBoundary: RouteErrorPage,
              children: [
                { index: true, Component: DiaryEditorPage },
                { path: 'history', Component: DiaryHistoryPage },
              ],
            },
            { path: '*', element: <p>其他页面</p> },
          ],
        },
      ],
      { initialEntries: [paths.diaries] },
    ),
  )

  return (
    <WorkspaceTestProviders keyword={keyword} titlebarTarget={props.titlebarTarget}>
      <RouterProvider router={router} />
    </WorkspaceTestProviders>
  )
}
function DiaryTestControls({ getProps }: { getProps: () => Props }) {
  const diary = useDiaryActions()
  const navigation = useLeaveProtection()
  const navigate = useNavigate()
  const location = useLocation()
  const pendingHomeAction = useRef<(() => void) | null>(null)
  useImperativeHandle(getProps().ref, () => ({
    go: async (to, state) => {
      await navigate(to, { state })
    },
    afterHomeNavigation: (action) => {
      pendingHomeAction.current = action
      void navigate(paths.diaries)
    },
    withSavedDiary: diary.withSavedDiary,
  }))
  const onLocation = useEffectEvent((path: string) => getProps().onLocation?.(path))
  useEffect(() => {
    onLocation(locationPath(location))
    if (location.pathname === paths.diaries) {
      const action = pendingHomeAction.current
      pendingHomeAction.current = null
      action?.()
    }
  }, [location])
  return navigation.error ? <p role="alert">{navigation.error}</p> : null
}
