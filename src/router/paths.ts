import { matchPath, type Location } from 'react-router'

const segment = (id: string) => encodeURIComponent(id)
export const paths = {
  diaries: '/diaries',
  diary: (id: string) => `/diaries/${segment(id)}`,
  history: (id: string) => `/diaries/${segment(id)}/history`,
  newChat: '/chats/new',
  chat: (id: string) => `/chats/${segment(id)}`,
  preview: (chat: string, task: string) => `/chats/${segment(chat)}/diary-preview/${segment(task)}`,
  appearance: '/settings/appearance',
  cli: '/settings/models/cli',
  api: '/settings/models/api',
  trash: (domain: 'diary' | 'chat') => `/settings/trash/${domain}`,
}
export function diaryId(pathname: string) {
  return matchPath('/diaries/:recordId/*', pathname)?.params.recordId ?? null
}
export function chatRoute(location: Pick<Location, 'pathname' | 'search'>) {
  const query = new URLSearchParams(location.search)
  const record = diaryId(location.pathname)
  const docked = Boolean(
    record && matchPath('/diaries/:recordId', location.pathname) && query.has('chat'),
  )
  const previewMatch = matchPath('/chats/:chatId/diary-preview/:taskId', location.pathname)
  const match = matchPath('/chats/:chatId', location.pathname) ?? previewMatch
  const raw = docked ? query.get('chat') : match?.params.chatId
  const preview = docked ? query.get('preview') : previewMatch?.params.taskId
  return {
    active: docked || Boolean(match),
    docked,
    diaryId: docked ? record : null,
    chatId: raw === 'new' ? null : (raw ?? null),
    previewId: preview ?? null,
    messageId: query.get('message'),
  }
}
export function dockPath(record: string, chat: string | null, preview?: string | null) {
  const query = new URLSearchParams({ chat: chat ?? 'new' })
  if (preview) query.set('preview', preview)
  return `${paths.diary(record)}?${query}`
}
export const locationPath = (location: Pick<Location, 'pathname' | 'search'>) =>
  location.pathname + location.search
