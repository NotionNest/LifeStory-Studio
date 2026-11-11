import { attachmentsApi } from '@/services/attachments'
import { useEffect, useRef, useState } from 'react'
import { AttachmentSurface, ImageViewer } from '@/components/attachments/AttachmentImage'

const queue: (() => void)[] = []
let running = 0
function schedule(task: () => Promise<void>) {
  let cancelled = false
  const run = () => {
    if (cancelled) return
    running++
    void task().finally(() => {
      running--
      queue.shift()?.()
    })
  }
  if (running < 4) run()
  else queue.push(run)
  return () => {
    cancelled = true
    const index = queue.indexOf(run)
    if (index >= 0) queue.splice(index, 1)
  }
}
function Thumbnail({
  recordId,
  imageId,
  onOpen,
}: {
  recordId: string
  imageId: string
  onOpen: () => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!element.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting)
      },
      { rootMargin: '200px' },
    )
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) {
      setUrl('')
      setError(false)
      return
    }
    let alive = true
    let objectUrl = ''
    setError(false)
    const cancel = schedule(async () => {
      try {
        const bytes = await attachmentsApi.image(recordId, imageId)
        if (!alive) return
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
        setUrl(objectUrl)
      } catch {
        if (alive) setError(true)
      }
    })
    return () => {
      alive = false
      cancel()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [recordId, imageId, visible, attempt])
  return (
    <div ref={element} className="diary-timeline-image">
      {visible && url && (
        <button type="button" aria-label="预览图片" onClick={onOpen} className="h-full w-full">
          <img src={url} alt="" draggable={false} />
        </button>
      )}
      {error && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          重试图片
        </button>
      )}
    </div>
  )
}
export function TimelineImages({ recordId, ids }: { recordId: string; ids: string[] }) {
  const [viewing, setViewing] = useState<string | null>(null)
  if (!ids.length) return null
  return (
    <div className="diary-timeline-images" onClick={(event) => event.stopPropagation()}>
      <AttachmentSurface scope={{ recordId, revisionId: null, imageIds: ids }}>
        {ids.map((id, index) => (
          <Thumbnail
            key={`${id}:${index}`}
            recordId={recordId}
            imageId={id}
            onOpen={() => setViewing(id)}
          />
        ))}
        {viewing && <ImageViewer attachmentId={viewing} onClose={() => setViewing(null)} />}
      </AttachmentSurface>
    </div>
  )
}
