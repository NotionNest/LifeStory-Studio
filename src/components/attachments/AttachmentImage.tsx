import { attachmentsApi, type Attachment } from '@/services/attachments'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
export interface AttachmentScope {
  recordId: string
  revisionId: string | null
  attachments?: Attachment[]
  editable?: boolean
  imageIds?: string[]
}
export const AttachmentContext = createContext<AttachmentScope | null>(null)
export function AttachmentImage({
  attachmentId,
  original = false,
  className = '',
}: {
  attachmentId: string
  original?: boolean
  className?: string
}) {
  const scope = useContext(AttachmentContext)
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  const name = scope?.attachments?.find((a) => a.id === attachmentId)?.name ?? '记录图片'
  const recordId = scope?.recordId,
    revisionId = scope?.revisionId
  const mediaType = scope?.attachments?.find((a) => a.id === attachmentId)?.mediaType ?? ''
  useEffect(() => {
    if (!recordId) return
    let alive = true,
      objectUrl = ''
    setUrl('')
    setError('')
    void attachmentsApi
      .image(recordId, attachmentId, revisionId ?? null, original)
      .then((bytes) => {
        if (!alive) return
        const type = original ? mediaType : 'image/png'
        objectUrl = URL.createObjectURL(new Blob([bytes], { type }))
        setUrl(objectUrl)
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause))
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [recordId, revisionId, mediaType, attachmentId, original, retry])
  if (!scope) return <span className="text-sm text-destructive">缺少图片所属记录</span>
  if (error)
    return (
      <span role="alert" className="inline-flex flex-col gap-1 text-xs text-destructive">
        {error}
        <Button size="xs" variant="ghost" onClick={() => setRetry((n) => n + 1)}>
          重试图片
        </Button>
      </span>
    )
  return url ? (
    <img draggable={false} src={url} alt={name} className={className} loading="lazy" />
  ) : (
    <span role="status" className="text-xs text-muted-foreground">
      读取图片…
    </span>
  )
}
export function ImageViewer({
  attachmentId,
  onClose,
}: {
  attachmentId: string
  onClose: () => void
}) {
  const scope = useContext(AttachmentContext)
  const [copyStatus, setCopyStatus] = useState('')
  const [viewing, setViewing] = useState(attachmentId)
  const ordered = scope?.imageIds ?? [attachmentId]
  const index = ordered.indexOf(viewing)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      aria-label="原图预览"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl overflow-auto rounded-lg border bg-card p-4 text-foreground backdrop:bg-foreground/30"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">原图</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (scope)
              void attachmentsApi
                .copyImage(scope.recordId, viewing, scope.revisionId)
                .then(() => setCopyStatus('图片已复制'))
                .catch((cause) => setCopyStatus(errorMessage(cause)))
          }}
        >
          复制图片
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          关闭图片
        </Button>
      </div>
      {copyStatus && (
        <p role="status" className="mb-3 text-sm">
          {copyStatus}
        </p>
      )}
      {ordered.length > 1 && (
        <div className="mb-3 flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={index <= 0}
            onClick={() => {
              setViewing(ordered[index - 1])
              setCopyStatus('')
            }}
          >
            上一张
          </Button>
          <span className="text-xs">
            {index + 1} / {ordered.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={index < 0 || index >= ordered.length - 1}
            onClick={() => {
              setViewing(ordered[index + 1])
              setCopyStatus('')
            }}
          >
            下一张
          </Button>
        </div>
      )}
      <AttachmentImage
        attachmentId={viewing}
        original
        className="mx-auto max-h-[75dvh] max-w-full object-contain"
      />
    </dialog>
  )
}
export function AttachmentSurface({
  scope,
  children,
}: {
  scope: AttachmentScope
  children: ReactNode
}) {
  return <AttachmentContext.Provider value={scope}>{children}</AttachmentContext.Provider>
}
