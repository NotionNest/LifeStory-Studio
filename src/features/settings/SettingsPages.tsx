import { useLayoutEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useAppearanceContext } from '@/contexts/AppearanceContext'
import { useLeaveStatus } from '@/contexts/LeaveProtectionContext'
import { paths } from '@/router/paths'
import { AppearanceSettings } from './AppearanceSettings'
import { TrashPanel } from './TrashPanel'
import { SettingsLink } from '@/components/SettingsLink'
export function AppearancePage() {
  const appearance = useAppearanceContext()
  return (
    <AppearanceSettings
      preference={appearance.preference}
      onChange={appearance.change}
      error={appearance.error}
    />
  )
}
export function TrashPage() {
  const { domain } = useParams(),
    status = useLeaveStatus()
  const [busy, setBusy] = useState(false)
  useLayoutEffect(() => {
    status.setBusy(busy)
  }, [status, busy])
  if (domain !== 'diary' && domain !== 'chat') throw new Error('未知的回收站分类。')
  return (
    <section className="settings-content" aria-labelledby="trash-heading">
      <header className="settings-heading">
        <h1 id="trash-heading">回收站</h1>
      </header>
      <div
        className="mb-5 grid w-full grid-cols-2 rounded-full bg-muted p-1"
        role="group"
        aria-label="回收站分类"
      >
        <SettingsLink pill to={paths.trash('diary')}>
          日记
        </SettingsLink>
        <SettingsLink pill to={paths.trash('chat')}>
          聊天
        </SettingsLink>
      </div>
      <TrashPanel
        key={domain}
        domain={domain}
        onBusy={(value) => {
          status.setBusy(value)
          setBusy(value)
        }}
      />
    </section>
  )
}
