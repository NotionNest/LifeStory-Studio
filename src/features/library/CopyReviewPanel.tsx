import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  references?: { quote: string; from: number | null; replaceable: boolean }[]
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
    case '标点问题':
      return 'punctuation'
    default:
      return 'review'
  }
}
function references(item: Item) {
  return item.references ?? [{ quote: item.quote, from: undefined, replaceable: true }]
}
function anchorKey(item: Item, index: number) {
  return JSON.stringify([item.id, index])
}
function matchesAt(doc: DocumentNode, from: number, quote: string) {
  return (
    from >= 0 &&
    from + quote.length <= doc.content.size &&
    doc.textBetween(from, from + quote.length, '', '\n') === quote
  )
}
function safeTextRange(doc: DocumentNode, from: number, to: number) {
  let safe = false
  doc.nodesBetween(from, to, (node, position) => {
    if (node.isText && position <= from && position + node.nodeSize >= to) safe = true
  })
  return safe
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
  modelControls,
  compactModelControls,
  preferenceError,
}: {
  editor: Editor
  readOnly: boolean
  requestReview?: (signal: AbortSignal) => Promise<Item[]>
  modelControls?: ReactNode
  compactModelControls?: ReactNode
  preferenceError?: string
}) {
  const [status, setStatus] = useState<
    'ready' | 'running' | 'stopping' | 'done' | 'failed' | 'stopped'
  >('ready')
  const [items, setItems] = useState<Item[]>([])
  const [hadSuggestions, setHadSuggestions] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set())
  const [revision, setRevision] = useState(0)
  const [failure, setFailure] = useState('')
  const hasText = useRef(Boolean(editor.getText().trim()))
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
      if (!itemsRef.current.length && !reviewHistory.current.size) {
        const nextHasText = Boolean(editor.getText().trim())
        if (nextHasText !== hasText.current) {
          hasText.current = nextHasText
          setRevision((n) => n + 1)
        }
        return
      }
      hasText.current = Boolean(editor.getText().trim())
      const current = JSON.stringify(editor.getJSON())
      const savedAnchors = [...anchorHistory.current]
        .reverse()
        .find((entry) => entry.doc.eq(editor.state.doc))
      if (savedAnchors) anchors.current = new Map(savedAnchors.anchors)
      else {
        const next = new Map<string, number>()
        for (const item of itemsRef.current) {
          references(item).forEach((reference, index) => {
            const key = anchorKey(item, index)
            const from = anchors.current.get(key)
            if (from === undefined) return
            const mapped = transaction.mapping.mapResult(from, 1)
            const end = transaction.mapping.mapResult(from + reference.quote.length, -1)
            if (
              !mapped.deleted &&
              !end.deleted &&
              end.pos - mapped.pos === reference.quote.length &&
              matchesAt(editor.state.doc, mapped.pos, reference.quote) &&
              (reference.from !== undefined ||
                positions(editor.state.doc, reference.quote).length === 1)
            )
              next.set(key, mapped.pos)
          })
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
  const validItem = (item: Item) =>
    !invalid.has(item.id) &&
    references(item).every((reference, index) => {
      const from = anchors.current.get(anchorKey(item, index))
      return (
        from !== undefined &&
        matchesAt(editor.state.doc, from, reference.quote) &&
        (reference.from !== undefined || positions(editor.state.doc, reference.quote).length === 1)
      )
    })
  useEffect(() => {
    const markers =
      status === 'done'
        ? items.flatMap((item) => {
            if (!validItem(item)) return []
            return references(item).map((reference, index) => ({
              id: item.id,
              from: anchors.current.get(anchorKey(item, index))!,
              to: anchors.current.get(anchorKey(item, index))! + reference.quote.length,
              type: markerType(item),
              active: active === item.id,
            }))
          })
        : []
    setReviewMarkers(editor, markers)
    // The editor revision changes whenever a mapped position can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, items, active, invalid, status, revision])
  const start = async () => {
    if (!requestReview || request.current) return
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
      if (controller.signal.aborted) {
        setStatus('stopped')
        return
      }
      anchors.current = new Map(
        found.flatMap((item) =>
          references(item).flatMap((reference, index) => {
            const matches = positions(source.doc, reference.quote)
            const original =
              reference.from === undefined
                ? matches.length === 1
                  ? matches[0]
                  : null
                : reference.from
            if (original === null || !matchesAt(source.doc, original, reference.quote)) return []
            const from = source.mapping.mapResult(original, 1)
            const to = source.mapping.mapResult(original + reference.quote.length, -1)
            const unique =
              reference.from !== undefined ||
              positions(editor.state.doc, reference.quote).length === 1
            return !from.deleted &&
              !to.deleted &&
              to.pos - from.pos === reference.quote.length &&
              matchesAt(editor.state.doc, from.pos, reference.quote) &&
              unique
              ? [[anchorKey(item, index), from.pos] as const]
              : []
          }),
        ),
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
      if (
        controller.signal.aborted &&
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        setStatus('stopped')
      } else {
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
      if (request.current === controller) {
        pending.current = null
        request.current = null
      }
    }
  }
  const locate = (item: Item, index = 0) => {
    setActive(item.id)
    const reference = references(item)[index]
    const from = anchors.current.get(anchorKey(item, index))
    if (reference && from !== undefined && validItem(item))
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to: from + reference.quote.length })
        .run()
  }
  const apply = (item: Item) => {
    const refs = references(item)
    const from = anchors.current.get(anchorKey(item, 0))
    if (
      readOnly ||
      item.replacement === undefined ||
      refs.length !== 1 ||
      !refs[0].replaceable ||
      from === undefined ||
      !safeTextRange(editor.state.doc, from, from + refs[0].quote.length) ||
      !validItem(item)
    )
      return
    const to = from + refs[0].quote.length
    const nextItems = items.filter((entry) => entry.id !== item.id)
    const nextInvalid = new Set(invalid)
    for (const entry of nextItems) {
      if (
        !validItem(entry) ||
        references(entry).some((reference, index) => {
          const other = anchors.current.get(anchorKey(entry, index))
          return other !== undefined && other < to && other + reference.quote.length > from
        })
      )
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
      {status !== 'ready' && status !== 'running' && status !== 'stopping' && (
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
            {compactModelControls ?? modelControls ?? (
              <Button variant="ghost" size="icon-sm" aria-label="选择审查模型" disabled>
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            )}
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
      {preferenceError && (
        <p role="alert" className="px-5 pt-3 text-xs text-destructive">
          {preferenceError}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
        {(status === 'ready' || status === 'running' || status === 'stopping') && (
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
                disabled={status === 'stopping'}
                onClick={() => {
                  request.current?.abort()
                  pending.current = null
                  setStatus('stopping')
                }}
              >
                <LoaderCircleIcon
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {status === 'stopping' ? '正在停止' : '停止审查'}
              </Button>
            )}
            {status === 'ready' ? (
              <>
                {modelControls}
                {!editor.getText().trim() && (
                  <span className="mt-2 text-xs text-muted-foreground">没有可审查文字</span>
                )}
              </>
            ) : (
              <span role="status" className="mt-2 text-xs text-muted-foreground">
                {status === 'stopping' ? '正在停止…' : '正在审查…'}
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
                const valid = validItem(item)
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
                        {item.replacement !== undefined && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-success hover:bg-[color-mix(in_oklch,var(--success)_17%,transparent)] hover:text-success"
                            aria-label="采纳建议"
                            disabled={
                              !valid ||
                              readOnly ||
                              !references(item)[0].replaceable ||
                              !safeTextRange(
                                editor.state.doc,
                                anchors.current.get(anchorKey(item, 0)) ?? 0,
                                (anchors.current.get(anchorKey(item, 0)) ?? 0) +
                                  references(item)[0].quote.length,
                              )
                            }
                            onClick={() => apply(item)}
                          >
                            <CheckIcon aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {references(item).map((reference, index) => (
                        <button
                          key={`${index}:${reference.quote}`}
                          className={`copy-review-mark copy-review-mark--${markerType(item)} mt-2 max-w-full break-words text-left text-sm`}
                          onClick={() => locate(item, index)}
                        >
                          “{reference.quote}”
                        </button>
                      ))}
                    </div>
                    {active === item.id && (
                      <>
                        <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
                          {item.reason}
                        </p>
                        {item.replacement !== undefined && (
                          <div className="mt-2 rounded bg-muted/70 px-2 py-1.5 text-xs break-words">
                            <span className="text-muted-foreground">建议修改为： </span>
                            {item.replacement || '删除'}
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
