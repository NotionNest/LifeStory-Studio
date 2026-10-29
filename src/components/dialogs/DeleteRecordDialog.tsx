import { trashApi, type DeleteImpact } from '@/services/trash'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { kindLabels } from '@/lib/recordLabels'

export function DeleteRecordDialog({
  impact,
  onClose,
  onDeleted,
}: {
  impact: DeleteImpact
  onClose: () => void
  onDeleted: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [current, setCurrent] = useState(impact),
    [uncertain, setUncertain] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const reconcile = async () => {
    try {
      const status = await trashApi.trashStatus(current.recordId)
      if (status !== 'active') {
        onDeleted()
        return false
      }
      setUncertain(false)
      return true
    } catch {
      setUncertain(true)
      setError('删除结果尚未确认，编辑已暂停。请重试核对状态后继续。')
      return false
    }
  }
  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await trashApi.trashMove(current)
      onDeleted()
    } catch (cause) {
      setError(errorMessage(cause))
      await reconcile()
    } finally {
      setBusy(false)
    }
  }
  const reread = async () => {
    setBusy(true)
    try {
      if (await reconcile()) {
        setCurrent(await trashApi.trashImpact(current.recordId))
        setError('')
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy && !uncertain) onClose()
      }}
      aria-labelledby="delete-record-title"
      className="fixed inset-0 m-auto max-h-[85vh] overflow-y-auto w-[calc(100%-3rem)] max-w-xl rounded-lg border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/25"
    >
      <h2 id="delete-record-title" className="text-lg font-semibold">
        将记录移入回收站？
      </h2>
      <p className="mt-3 font-medium">{current.title || '无标题记录'}</p>
      <p className="mt-3 text-sm leading-6">
        移入后退出资料库搜索和新的选材，30
        天后自动彻底删除。清理前可在回收站恢复，也可提前彻底删除。
      </p>
      <h3 className="mt-4 text-sm font-semibold">关联影响</h3>
      {current.references.length ? (
        <ul className="my-2 space-y-1 text-sm">
          {current.references.map((item) => (
            <li key={item.id}>
              {kindLabels[item.kind]} · {item.title || '无标题内容'}
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-2 text-sm text-muted-foreground">没有已关联内容。</p>
      )}
      <p className="text-sm leading-6 text-muted-foreground">
        彻底删除会清除原文、历史与应用管理的引用资料；已创建的日记保留，来源标记失效。其他记录仍使用的图片保留。迁移备份、已有导出及外部备份不会随之清除。已发送给
        AI 服务的内容无法通过本地删除撤回。
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="destructive" disabled={busy || uncertain} onClick={() => void remove()}>
          移入回收站
        </Button>
        <Button variant="outline" disabled={busy || uncertain} onClick={onClose}>
          取消
        </Button>
        {error && (
          <Button variant="secondary" disabled={busy} onClick={() => void reread()}>
            重新核对影响
          </Button>
        )}
      </div>
    </dialog>
  )
}
