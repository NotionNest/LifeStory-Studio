import type { ComponentType } from 'react'
import {
  createHashRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router'
import { DiaryHomePage } from '@/features/library/DiaryHomePage'
import { DiaryDetailLayout } from '@/features/library/DiaryDetailLayout'
import { DiaryEditorPage } from '@/features/library/DiaryEditorPage'
import { DiaryHistoryPage } from '@/features/library/DiaryHistoryPage'
import { diaryLoader } from '@/features/library/diaryLoader'
import { ChatWorkspace } from '@/features/chat/ChatWorkspace'
import { ChatMessagesPage } from '@/features/chat/ChatMessagesPage'
import { ChatDiaryPreviewPage } from '@/features/chat/ChatDiaryPreviewPage'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { ModelsLayout } from '@/layouts/ModelsLayout'
import { AppearancePage, TrashPage } from '@/features/settings/SettingsPages'
import { AiSettingsView } from '@/features/settings/AiSettings'
import { LocalCliSettingsView } from '@/features/settings/LocalCliSettings'
import { paths } from './paths'
import { RouteErrorPage } from './RouteError'

export function createStudioRouter(Root: ComponentType, initialEntries?: string[]) {
  const routes: RouteObject[] = [
    {
      Component: Root,
      ErrorBoundary: RouteErrorPage,
      HydrateFallback: () => (
        <p role="status" className="p-8">
          正在打开页面…
        </p>
      ),
      children: [
        { index: true, element: <Navigate to={paths.diaries} replace /> },
        {
          path: 'diaries',
          ErrorBoundary: RouteErrorPage,
          children: [
            { index: true, Component: DiaryHomePage },
            {
              path: ':recordId',
              loader: diaryLoader,
              Component: DiaryDetailLayout,
              ErrorBoundary: RouteErrorPage,
              children: [
                { index: true, Component: DiaryEditorPage },
                { path: 'history', Component: DiaryHistoryPage },
              ],
            },
          ],
        },
        {
          path: 'chats',
          Component: Outlet,
          ErrorBoundary: RouteErrorPage,
          children: [
            { index: true, element: <Navigate to={paths.newChat} replace /> },
            {
              path: 'new',
              Component: ChatWorkspace,
              children: [{ index: true, Component: ChatMessagesPage }],
            },
            {
              path: ':chatId',
              Component: ChatWorkspace,
              children: [
                { index: true, Component: ChatMessagesPage },
                { path: 'diary-preview/:taskId', Component: ChatDiaryPreviewPage },
              ],
            },
          ],
        },
        {
          path: 'settings',
          Component: SettingsLayout,
          ErrorBoundary: RouteErrorPage,
          children: [
            { index: true, element: <Navigate to={paths.appearance} replace /> },
            { path: 'appearance', Component: AppearancePage },
            {
              path: 'models',
              Component: ModelsLayout,
              children: [
                { index: true, element: <Navigate to={paths.cli} replace /> },
                { path: 'cli', Component: LocalCliSettingsView },
                { path: 'api', Component: AiSettingsView },
              ],
            },
            {
              path: 'trash',
              children: [
                { index: true, element: <Navigate to={paths.trash('diary')} replace /> },
                { path: ':domain', Component: TrashPage },
              ],
            },
          ],
        },
        { path: '*', Component: RouteErrorPage },
      ],
    },
  ]
  return initialEntries ? createMemoryRouter(routes, { initialEntries }) : createHashRouter(routes)
}
