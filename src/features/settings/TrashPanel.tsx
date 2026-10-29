import { trashApi, type TrashItem, type TrashPage } from '@/services/trash'
import { Trash2Icon, RefreshCwIcon, RotateCcwIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { kindLabels } from '@/lib/recordLabels'
const time = (value: number) => new Date(value).toLocaleString()

export function TrashPanel({
  onBusy,
  domain = 'diary',
}: {
  onBusy?: (busy: boolean) => void
  domain?: 'diary' | 'chat'
}) {
  const alive = useRef(true),
    [page, setPage] = useState<TrashPage>({ items: [], nextOffset: null, cleanupError: null }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState<TrashItem | null>(null),
    [accepted, setAccepted] = useState(false),
    [notice, setNotice] = useState('')
  const refresh = useCallback(
    async (offset = 0) => {
      setBusy(true)
      setError('')
      try {
        const result = await trashApi.trashList(offset, domain)
        if (alive.current) {
          setPage((old) => ({
            ...result,
            items: offset
              ? [...old.items, ...result.items.filter((i) => !old.items.some((o) => o.id === i.id))]
              : result.items,
          }))
        }
      } catch (cause) {
        if (alive.current) setError(errorMessage(cause))
      } finally {
        if (alive.current) setBusy(false)
      }
    },
    [domain],
  )
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
    }
  }, [refresh])
  useEffect(() => {
    onBusy?.(busy)
    return () => onBusy?.(false)
  }, [busy, onBusy])
  const act = async (item: TrashItem, purge: boolean) => {
    setBusy(true)
    setError('')
    try {
      if (purge) await trashApi.trashPurge(item)
      else await trashApi.trashRestore(item)
      setConfirm(null)
      setNotice(purge ? '记录已彻底删除。' : '记录已恢复。')
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label={domain === 'chat' ? '聊天回收站' : '日记回收站'}>
      {notice && (
        <p role="status" className="my-3 text-sm">
          {notice}
        </p>
      )}
      {(error || page.cleanupError) && (
        <p role="alert" className="my-3 text-sm text-destructive">
          {error || page.cleanupError}
        </p>
      )}
      <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
        {error || page.cleanupError ? '刷新并重试清理' : '刷新列表'}
      </Button>
      {busy && (
        <p role="status" className="mt-3 text-sm">
          正在处理…
        </p>
      )}
      {!busy && !page.items.length && !error && (
        <div className="workspace-empty">
          <Trash2Icon aria-hidden="true" />
          <h2>回收站为空</h2>
        </div>
      )}
      <ul className="mt-4 divide-y">
        {page.items.map((item) => (
          <li key={item.id} className="py-4">
            <p className="font-medium">{item.title || '无标题记录'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {kindLabels[item.kind]} · {item.recordDate}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              删除于 {time(item.deletedAt)} · 预计清理 {time(item.purgeAt)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || Boolean(confirm)}
                onClick={() => void act(item, false)}
              >
                <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                恢复记录
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || Boolean(confirm)}
                onClick={() => {
                  setConfirm(item)
                  setAccepted(false)
                  setError('')
                }}
              >
                彻底删除…
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {page.nextOffset !== null && (
        <Button variant="outline" disabled={busy} onClick={() => void refresh(page.nextOffset!)}>
          加载更多回收记录
        </Button>
      )}
      {confirm && (
        <section
          role="alertdialog"
          aria-labelledby="purge-title"
          className="mt-5 rounded border border-destructive p-4"
        >
          <h3 id="purge-title" className="font-semibold">
            确认彻底删除“{confirm.title || '无标题记录'}”？
          </h3>
          <p className="mt-2 text-sm leading-6">
            原文、历史、恢复草稿和应用管理的来源资料将清除；独立日记及其他记录使用的图片保留。此操作无法在应用中撤销。
          </p>
          <label className="my-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              disabled={busy}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            我确认立即彻底删除，无法恢复
          </label>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={busy || !accepted}
              onClick={() => void act(confirm, true)}
            >
              确认彻底删除
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              取消彻底删除
            </Button>
          </div>
        </section>
      )}
    </section>
  )
}
