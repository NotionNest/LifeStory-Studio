import { useLoaderData, useParams, useLocation } from 'react-router'
import { desktopAvailable } from '@/services/desktop'
import type { DiaryData } from './diaryLoader'
import { DiarySessionProvider } from './DiarySessionProvider'

export function DiaryDetailLayout() {
  const data = useLoaderData() as DiaryData
  const { recordId } = useParams(),
    location = useLocation()
  if (!desktopAvailable)
    return (
      <p role="status" className="p-8">
        请在桌面应用中打开资料库。
      </p>
    )
  if (data.preview && location.pathname.endsWith('/history'))
    throw new Error('此记录不支持日记历史。')
  return <DiarySessionProvider key={recordId} data={data} />
}
