import { useNavigate, useParams } from 'react-router'
import { paths } from '@/router/paths'
import { HistoryPage } from './HistoryPage'
import { useDiary } from './DiarySessionContext'

export function DiaryHistoryPage() {
  const { history: session } = useDiary()
  const navigate = useNavigate(),
    { recordId } = useParams()
  if (!session.record || !session.sessionId) throw new Error('此记录没有可恢复的日记历史。')
  return (
    <HistoryPage
      ref={session.controller}
      record={session.record}
      sessionId={session.sessionId}
      onClose={() => void navigate(paths.diary(recordId!))}
      onRestored={(editing) => {
        session.restored(editing)
        void navigate(paths.diary(recordId!), { replace: true })
      }}
    />
  )
}
