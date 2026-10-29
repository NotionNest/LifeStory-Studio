import { recordsApi, type RecoverySummary } from '@/services/records'
import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { paths } from '@/router/paths'
import { useLeaveProtection } from '@/contexts/LeaveProtectionContext'
import { desktopAvailable } from '@/services/desktop'
import { useCreateDiary } from './DiaryCreation'
import { LibraryBrowser } from './LibraryBrowser'
import { useDiaryBrowser } from './DiaryBrowserSession'
import { errorMessage } from '@/lib/errors'

export function DiaryHomePage() {
  const navigate = useNavigate(),
    navigation = useLeaveProtection()
  const reportError = useEffectEvent((cause: unknown) => navigation.setError(errorMessage(cause)))
  const { browser, positions } = useDiaryBrowser()
  const [recoveries, setRecoveries] = useState<RecoverySummary[]>([])
  const { create, working: creating } = useCreateDiary()
  useEffect(() => {
    if (!desktopAvailable) return
    let valid = true
    void recordsApi
      .recoveries()
      .then((value) => {
        if (valid) setRecoveries(value)
      })
      .catch((cause) => {
        if (valid) reportError(cause)
      })
    return () => {
      valid = false
    }
  }, [])
  if (!desktopAvailable)
    return (
      <p role="status" className="p-8">
        请在桌面应用中打开资料库。
      </p>
    )
  return (
    <section aria-label="日记首页" className="flex h-full min-h-0 flex-col">
      {recoveries.length > 0 && (
        <section
          aria-label="待恢复草稿"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-3"
        >
          <h2 className="text-sm font-medium">待恢复草稿</h2>
          {recoveries.map((item) => (
            <Button
              key={item.recordId}
              size="sm"
              variant="ghost"
              disabled={creating}
              onClick={() => void navigate(paths.diary(item.recordId))}
            >
              {item.title || '无标题记录'} · {new Date(item.writtenAt).toLocaleString()}
            </Button>
          ))}
        </section>
      )}
      <LibraryBrowser
        browser={browser}
        positions={positions}
        working={creating}
        onCreate={(date) => void create(date)}
        onOpen={(item) => void navigate(paths.diary(item.id))}
      />
    </section>
  )
}
