import { useEffect, useRef, useState } from 'react'
import type { useEditor } from '@tiptap/react'
import {
  CheckIcon,
  CircleAlertIcon,
  ChevronDownIcon,
  FileSearchIcon,
  FileCheck2Icon,
  FileTextIcon,
  LoaderCircleIcon,
  ListChecksIcon,
  Redo2Icon,
  RotateCwIcon,
  ScanTextIcon,
  SearchIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { closeHistory } from '@tiptap/pm/history'
import type { Transaction } from '@tiptap/pm/state'
import type { Node as DocumentNode } from '@tiptap/pm/model'
import { Mapping } from '@tiptap/pm/transform'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { installReviewMarkers, setReviewMarkers } from './copyReviewMarkers'

type Editor = NonNullable<ReturnType<typeof useEditor>>
export type CopyReviewItem = {
  id: string
  type: string
  quote: string
  reason: string
  replacement?: string
}
type Item = CopyReviewItem
function markerType(item: Item) {
  switch (item.type) {
    case '疑似错别字':
      return 'error'
    case '重复表达':
      return 'repeat'
    case '表达冗长':
      return 'wordy'
    case '语句不通顺':
      return 'flow'
    default:
      return 'review'
  }
}
function positions(doc: DocumentNode, quote: string) {
  const matches: number[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    let start = 0
    while (start <= node.text.length - quote.length) {
      const index = node.text.indexOf(quote, start)
      if (index < 0) break
      matches.push(pos + index)
      start = index + 1
    }
  })
  return matches
}
export function CopyReviewPanel({
  editor,
  readOnly,
  requestReview,
}: {
  editor: Editor
  readOnly: boolean
  requestReview?: (signal: AbortSignal) => Promise<Item[]>
}) {
  const [status, setStatus] = useState<'ready' | 'running' | 'done' | 'failed' | 'stopped'>('ready')
  const [items, setItems] = useState<Item[]>([])
  const [hadSuggestions, setHadSuggestions] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set())
  const [revision, setRevision] = useState(0)
  const [failure, setFailure] = useState('')
  const request = useRef<AbortController | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const snapshot = useRef('')
  const anchors = useRef(new Map<string, number>())
  const anchorHistory = useRef<{ doc: DocumentNode; anchors: Map<string, number> }[]>([])
  const pending = useRef<{ doc: DocumentNode; mapping: Mapping } | null>(null)
  const ignored = useRef(new Set<string>())
  const cards = useRef(new Map<string, HTMLElement>())
  const scrollTarget = useRef<string | null>(null)
  const reviewHistory = useRef(
    new Map<string, { items: Item[]; invalid: Set<string>; active: string | null }>(),
  )
  useEffect(
    () =>
      installReviewMarkers(editor, (id) => {
        scrollTarget.current = id
        cards.current.get(id)?.scrollIntoView?.({ block: 'nearest' })
        setActive(id)
      }),
    [editor],
  )
  useEffect(() => {
    if (active && scrollTarget.current === active) {
      cards.current.get(active)?.scrollIntoView?.({ block: 'nearest' })
      scrollTarget.current = null
    } else scrollTarget.current = null
  }, [active])
  useEffect(() => {
    const update = ({ transaction }: { transaction: Transaction }) => {
      if (pending.current) pending.current.mapping.appendMapping(transaction.mapping)
      if (!itemsRef.current.length && !reviewHistory.current.size) return
      const current = JSON.stringify(editor.getJSON())
      const savedAnchors = [...anchorHistory.current]
        .reverse()
        .find((entry) => entry.doc.eq(editor.state.doc))
      if (savedAnchors) anchors.current = new Map(savedAnchors.anchors)
      else {
        const next = new Map<string, number>()
        for (const [id, from] of anchors.current) {
          const item = itemsRef.current.find((entry) => entry.id === id)
          if (!item) continue
          const mapped = transaction.mapping.map(from, 1)
          const matches = positions(editor.state.doc, item.quote)
          if (matches.length === 1 && matches[0] === mapped) next.set(id, mapped)
        }
        anchors.current = next
        anchorHistory.current.push({ doc: editor.state.doc, anchors: new Map(next) })
        if (anchorHistory.current.length > 100) anchorHistory.current.shift()
      }
      const restored = reviewHistory.current.get(current)
      if (restored) {
        snapshot.current = current
        setItems(restored.items.filter((item) => !ignored.current.has(item.id)))
        setInvalid(restored.invalid)
        setActive(restored.active)
      }
      setRevision((n) => n + 1)
    }
    editor.on('update', update)
    return () => {
      editor.off('update', update)
      request.current?.abort()
    }
  }, [editor])
  useEffect(() => {
    const markers =
      status === 'done'
        ? items.flatMap((item) => {
            if (invalid.has(item.id)) return []
            const matches = positions(editor.state.doc, item.quote)
            if (matches.length !== 1 || anchors.current.get(item.id) !== matches[0]) return []
            return [
              {
                id: item.id,
                from: matches[0],
                to: matches[0] + item.quote.length,
                type: markerType(item),
                active: active === item.id,
              },
            ]
          })
        : []
    setReviewMarkers(editor, markers)
  }, [editor, items, active, invalid, status, revision])
  const start = async () => {
    if (!requestReview) return
    snapshot.current = JSON.stringify(editor.getJSON())
    const source = { doc: editor.state.doc, mapping: new Mapping() }
    pending.current = source
    ignored.current.clear()
    anchors.current.clear()
    anchorHistory.current = []
    setItems([])
    setHadSuggestions(false)
    setInvalid(new Set())
    reviewHistory.current.clear()
    setActive(null)
    setStatus('running')
    setFailure('')
    const controller = new AbortController()
    request.current = controller
    try {
      const found = await requestReview(controller.signal)
      if (controller.signal.aborted) return
      anchors.current = new Map(
        found.flatMap((item) => {
          const original = positions(source.doc, item.quote)
          if (original.length !== 1) return []
          const from = source.mapping.mapResult(original[0], 1)
          const to = source.mapping.mapResult(original[0] + item.quote.length, -1)
          const matches = positions(editor.state.doc, item.quote)
          return !from.deleted &&
            !to.deleted &&
            to.pos - from.pos === item.quote.length &&
            matches.length === 1 &&
            matches[0] === from.pos
            ? [[item.id, from.pos] as const]
            : []
        }),
      )
      pending.current = null
      anchorHistory.current.push({ doc: editor.state.doc, anchors: new Map(anchors.current) })
      setHadSuggestions(found.length > 0)
      if (found.length)
        reviewHistory.current.set(snapshot.current, {
          items: found,
          invalid: new Set(),
          active: found[0]?.id ?? null,
        })
      setItems(found)
      setActive(found[0]?.id ?? null)
      setStatus('done')
    } catch (error) {
      if (!controller.signal.aborted) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : typeof error === 'object' && error !== null && 'message' in error
                ? String(error.message)
                : ''
        setFailure(message.trim() || '审查未完成')
        setStatus('failed')
      }
    } finally {
      if (request.current === controller) pending.current = null
    }
  }
  const locate = (item: Item) => {
    setActive(item.id)
    const matches = positions(editor.state.doc, item.quote)
    if (
      !invalid.has(item.id) &&
      matches.length === 1 &&
      anchors.current.get(item.id) === matches[0]
    )
      editor
        .chain()
        .focus()
        .setTextSelection({ from: matches[0], to: matches[0] + item.quote.length })
        .run()
  }
  const apply = (item: Item) => {
    const matches = positions(editor.state.doc, item.quote)
    if (
      readOnly ||
      !item.replacement ||
      invalid.has(item.id) ||
      matches.length !== 1 ||
      anchors.current.get(item.id) !== matches[0]
    )
      return
    const from = matches[0],
      to = from + item.quote.length
    const nextItems = items.filter((entry) => entry.id !== item.id)
    const nextInvalid = new Set(invalid)
    for (const entry of nextItems) {
      const other = positions(editor.state.doc, entry.quote)
      if (other.length !== 1 || (other[0] < to && other[0] + entry.quote.length > from))
        nextInvalid.add(entry.id)
    }
    snapshot.current = JSON.stringify(editor.getJSON())
    reviewHistory.current.set(snapshot.current, { items, invalid, active: item.id })
    editor.view.dispatch(closeHistory(editor.state.tr))
    const transaction = closeHistory(editor.state.tr.insertText(item.replacement, from, to))
    const nextSnapshot = JSON.stringify(transaction.doc.toJSON())
    reviewHistory.current.set(nextSnapshot, {
      items: nextItems,
      invalid: nextInvalid,
      active: null,
    })
    editor.view.dispatch(transaction)
    editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
    snapshot.current = nextSnapshot
    setItems(nextItems)
    setInvalid(nextInvalid)
    setActive(null)
  }
  return (
    <section aria-label="文案审查" className="flex h-full min-h-0 flex-col bg-card">
      {status !== 'ready' && status !== 'running' && (
        <header className="workspace-toolbar flex-nowrap gap-2">
          <div className="flex min-w-0 max-w-56 items-center rounded-lg border border-input bg-background">
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1 justify-start gap-2"
              aria-label="重新审查"
              disabled={!requestReview || readOnly || !editor.getText().trim()}
              onClick={start}
            >
              <FileSearchIcon className="text-primary" aria-hidden="true" />
              <span>重新审查</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label="选择审查模型"
              disabled
            >
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="撤销"
              disabled={readOnly || !editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2Icon aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="重做"
              disabled={readOnly || !editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2Icon aria-hidden="true" />
            </Button>
          </div>
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
        {(status === 'ready' || status === 'running') && (
          <div className="flex h-full flex-col items-center justify-center">
            <div
              className="relative mb-6 grid size-28 place-items-center rounded-3xl bg-muted"
              aria-hidden="true"
            >
              <FileTextIcon className="size-16 stroke-1 text-muted-foreground" />
              <span className="absolute bottom-3 right-2 grid size-10 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground">
                <SearchIcon className="size-5" />
              </span>
            </div>
            {status === 'ready' ? (
              <Button
                className="min-w-36"
                disabled={!requestReview || readOnly || !editor.getText().trim()}
                onClick={start}
              >
                <FileSearchIcon aria-hidden="true" />
                开始审查
              </Button>
            ) : (
              <Button
                className="min-w-36"
                variant="outline"
                onClick={() => {
                  request.current?.abort()
                  pending.current = null
                  setStatus('stopped')
                }}
              >
                <LoaderCircleIcon
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                停止审查
              </Button>
            )}
            {status === 'ready' ? (
              <span className="mt-2 text-xs text-muted-foreground">审查服务尚未接入</span>
            ) : (
              <span role="status" className="mt-2 text-xs text-muted-foreground">
                正在审查…
              </span>
            )}
          </div>
        )}
        {status === 'stopped' && (
          <p className="py-12 text-center text-sm text-muted-foreground">审查已停止。</p>
        )}
        {status === 'failed' && (
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center gap-3 text-center"
          >
            <span
              className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-destructive"
              aria-hidden="true"
            >
              <CircleAlertIcon className="size-7" />
            </span>
            <p className="text-sm font-medium">审查失败</p>
            <p className="text-xs text-muted-foreground">{failure}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={!requestReview || readOnly || !editor.getText().trim()}
              onClick={start}
            >
              <RotateCwIcon aria-hidden="true" />
              重试
            </Button>
          </div>
        )}
        {status === 'done' &&
          (items.length === 0 ? (
            <div
              role="status"
              className="flex h-full flex-col items-center justify-center gap-3 text-center"
            >
              <span
                className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklch,var(--success)_12%,transparent)] text-success"
                aria-hidden="true"
              >
                {hadSuggestions ? (
                  <ListChecksIcon className="size-7" />
                ) : (
                  <FileCheck2Icon className="size-7" />
                )}
              </span>
              <p className="text-sm font-medium">{hadSuggestions ? '建议已处理' : '未发现建议'}</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-sm font-medium">
                <span>审查建议</span>
                <span className="text-xs text-muted-foreground">{items.length} 条</span>
              </div>
              {items.map((item) => {
                const valid =
                  !invalid.has(item.id) &&
                  positions(editor.state.doc, item.quote).length === 1 &&
                  anchors.current.get(item.id) === positions(editor.state.doc, item.quote)[0]
                return (
                  <article
                    key={item.id}
                    ref={(node) => {
                      if (node) cards.current.set(item.id, node)
                      else cards.current.delete(item.id)
                    }}
                    className={`group/review mb-2 rounded-lg border p-3 ${active === item.id ? 'border-primary/35 bg-accent/30' : 'border-border/70'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <button
                          className="min-w-0 text-left text-xs font-medium"
                          aria-expanded={active === item.id}
                          onClick={() => setActive(active === item.id ? null : item.id)}
                        >
                          {item.type}
                        </button>
                        {!valid && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                tabIndex={0}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <CircleAlertIcon className="size-3" aria-hidden="true" />
                                需重新核对
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>原文已变化或无法准确定位</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div
                        className={`flex shrink-0 items-center gap-1 transition-opacity motion-reduce:transition-none group-hover/review:opacity-100 group-focus-within/review:opacity-100 [@media(hover:none)]:opacity-100 ${active === item.id ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="定位原文"
                          disabled={!valid}
                          onClick={() => locate(item)}
                        >
                          <ScanTextIcon aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="忽略建议"
                          onClick={() => {
                            ignored.current.add(item.id)
                            const remaining = items.filter((entry) => entry.id !== item.id)
                            if (snapshot.current === JSON.stringify(editor.getJSON()))
                              reviewHistory.current.set(snapshot.current, {
                                items: remaining,
                                invalid,
                                active: null,
                              })
                            setItems(remaining)
                            setActive(null)
                          }}
                        >
                          <XIcon aria-hidden="true" />
                        </Button>
                        {item.replacement && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-success hover:bg-[color-mix(in_oklch,var(--success)_17%,transparent)] hover:text-success"
                            aria-label="采纳建议"
                            disabled={!valid || readOnly}
                            onClick={() => apply(item)}
                          >
                            <CheckIcon aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <button
                      className={`copy-review-mark copy-review-mark--${markerType(item)} mt-2 max-w-full break-words text-left text-sm`}
                      onClick={() => locate(item)}
                    >
                      “{item.quote}”
                    </button>
                    {active === item.id && (
                      <>
                        <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
                          {item.reason}
                        </p>
                        {item.replacement && (
                          <div className="mt-2 rounded bg-muted/70 px-2 py-1.5 text-xs break-words">
                            <span className="text-muted-foreground">建议修改为： </span>
                            {item.replacement}
                          </div>
                        )}
                      </>
                    )}
                  </article>
                )
              })}
            </>
          ))}
      </div>
    </section>
  )
}
