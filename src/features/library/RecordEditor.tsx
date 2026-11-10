import {
  recordsApi,
  type RecordFile,
  type SaveInput,
  type EditingSession,
} from '@/services/records'
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { DiarySidebarContext } from '@/layouts/DiarySidebarContext'
import { ConnectedCopyReviewPanel } from './ConnectedCopyReviewPanel'
import {
  BoldIcon,
  ItalicIcon,
  HeadingIcon,
  ListIcon,
  ImagePlusIcon,
  CalendarDaysIcon,
  UnderlineIcon,
  StrikethroughIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  EraserIcon,
  IndentIncreaseIcon,
  IndentDecreaseIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  SmilePlusIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, useState, type Ref, type FormEvent } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { AttachmentSurface } from '@/components/attachments/AttachmentImage'
import { recordExtensions } from './recordExtensions'
import { ColorPalette } from './ColorPalette'
import { closeHistory } from '@tiptap/pm/history'
import { imageIds } from './imageDocument'
import { useRecordPersistence } from './useRecordPersistence'
import { Button } from '@/components/ui/button'
import { TagManager } from './TagManager'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateFilterContent } from '@/components/date-filter/DateFilterContent'
import { blankDateCondition, resolveDateConstraint } from '@/components/date-filter/dateConditions'
import { errorMessage } from '@/lib/errors'
import type { Tag } from '@/services/tags'
export interface ImportReport {
  recordId: string
  messages: string[]
  retry: File[]
}
export interface EditorHandle {
  imageDocument: (id: string, position: number) => object
  acceptImage: (editing: EditingSession, id: string, position: number) => number
  contentVersion: () => number
  prepareLeave: () => Promise<'saved' | 'failed'>
  resume: () => void
  flush: () => Promise<'saved' | 'failed'>
  save: () => Promise<boolean>
  export: () => Promise<boolean>
  discard: () => Promise<boolean>
}
interface Props {
  record: RecordFile
  sessionId: string
  recovered?: SaveInput | null
  recoveredTags?: Tag[]
  ref: Ref<EditorHandle>
  onDirty: (dirty: boolean) => void
  onBusy: (busy: boolean) => void
  onSaved: () => void
  onFailure: (message: string) => void
  onImport?: (files: File[], position: number) => void
  importReport?: ImportReport | null
}
function useRecordEditor({
  record,
  sessionId,
  recovered,
  recoveredTags,
  ref,
  onDirty,
  onBusy,
  onSaved,
  onFailure,
  onImport,
  importReport,
}: Props) {
  const [title, setTitle] = useState(recovered ? (recovered.title ?? '') : (record.title ?? ''))
  const [mood, setMood] = useState(recovered ? (recovered.mood ?? null) : (record.mood ?? null))
  const moodInput = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(recovered?.recordDate ?? record.recordDate)
  const [tags, setTags] = useState(recovered ? (recoveredTags ?? []) : record.tags)
  const [dateOpen, setDateOpen] = useState(false)
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null),
    lastPosition = useRef<number | null>(null)
  const article = useRef<HTMLElement>(null),
    locked = useRef(false)
  const [readOnly, setReadOnly] = useState(false)
  const [tagBusy, setTagBusy] = useState(false)
  const persistenceRef = useRef<ReturnType<typeof useRecordPersistence> | null>(null)
  const editor = useEditor({
    extensions: recordExtensions,
    content: recovered?.document ?? record.document,
    onUpdate: () => persistenceRef.current?.changed(),
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '记录正文', 'aria-multiline': 'true' },
      handleDOMEvents: {
        compositionstart: () => {
          persistenceRef.current?.compositionStart()
          return false
        },
        compositionend: () => {
          persistenceRef.current?.compositionEnd()
          return false
        },
      },
    },
  })
  const persistence = useRecordPersistence({
    record,
    sessionId,
    recovered,
    editor,
    content: () => ({
      title: title || null,
      mood,
      recordDate: date,
      tagIds: tags.map((t) => t.id),
      document: editor?.getJSON() ?? record.document,
    }),
    onDirty,
    onSaved,
    onFailure,
  })
  persistenceRef.current = persistence
  const { status, busy, changed, save } = persistence
  const freeze = (value: boolean) => {
    if (value) setDateOpen(false)
    locked.current = value
    setReadOnly(value)
    editor?.setEditable(!value, false)
    // Apply to native controls synchronously, before React commits the visual state.
    article.current?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.readOnly = value
    })
  }
  useImperativeHandle(ref, () => ({
    imageDocument: (id, position) => {
      if (!editor) throw new Error('编辑器尚未准备好')
      return editor.state.tr
        .replaceRangeWith(
          position,
          position,
          editor.schema.nodes.attachmentImage.create({ attachmentId: id }),
        )
        .doc.toJSON()
    },
    acceptImage: (editing, id, position) => {
      if (!editor) throw new Error('编辑器尚未准备好')
      const transaction = editor.state.tr.replaceRangeWith(
        position,
        position,
        editor.schema.nodes.attachmentImage.create({ attachmentId: id }),
      )
      editor.view.dispatch(closeHistory(transaction))
      editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
      persistence.acceptImage(editing)
      const next = transaction.mapping.map(position, 1)
      lastPosition.current = next
      return next
    },
    contentVersion: () => persistence.snapshot().baseContentVersion,
    prepareLeave: async () => {
      if (!(await persistence.waitForComposition())) return 'failed'
      freeze(true)
      return persistence.flush()
    },
    resume: () => freeze(false),
    save,
    flush: persistence.flush,
    discard: persistence.discard,
    export: async () => {
      try {
        return await recordsApi.export(persistence.snapshot())
      } catch (cause) {
        setError(errorMessage(cause))
        return false
      }
    },
  }))
  useEffect(() => {
    onBusy(tagBusy)
  }, [tagBusy, onBusy])
  const format = (
    action: 'bold' | 'italic' | 'underline' | 'strike' | 'list' | 'ordered' | 'task' | 'quote',
  ) => {
    if (!editor || locked.current) return
    const chain = editor.chain().focus()
    if (action === 'bold') chain.toggleBold().run()
    if (action === 'italic') chain.toggleItalic().run()
    if (action === 'underline') chain.toggleUnderline().run()
    if (action === 'strike') chain.toggleStrike().run()
    if (action === 'ordered') chain.toggleOrderedList().run()
    if (action === 'task') chain.toggleTaskList().run()
    if (action === 'quote') chain.toggleBlockquote().run()
    if (action === 'list') chain.toggleBulletList().run()
  }
  const guardInput = (event: FormEvent) => {
    if (locked.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const importFiles = (
    files: File[],
    position = lastPosition.current ?? editor?.state.doc.content.size ?? 0,
  ) => {
    if (!locked.current && files.length) onImport?.(files, position)
  }

  return {
    record,
    ref,
    onBusy,
    onImport,
    importReport,
    mood,
    setMood,
    moodInput,
    title,
    setTitle,
    date,
    setDate,
    tags,
    setTags,
    dateOpen,
    setDateOpen,
    error,
    picker,
    lastPosition,
    article,
    locked,
    readOnly,
    tagBusy,
    setTagBusy,
    editor,
    persistence,
    status,
    busy,
    changed,
    save,
    format,
    guardInput,
    importFiles,
  }
}
const RecordEditorContext = createContext<ReturnType<typeof useRecordEditor> | null>(null)
export function RecordEditorSession({ children, ...props }: Props & { children: ReactNode }) {
  const session = useRecordEditor(props)
  return <RecordEditorContext value={session}>{children}</RecordEditorContext>
}
export function RecordEditor(props: Props) {
  return (
    <RecordEditorSession {...props}>
      <RecordSaveStatus />
      <RecordEditorView />
    </RecordEditorSession>
  )
}
export function RecordSaveStatus() {
  const session = useContext(RecordEditorContext)
  if (!session) return null
  const { status } = session
  return (
    <div className="editor-save-status">
      <span role="status" className="sr-only">
        {status}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={status} className="editor-save-indicator">
            <span
              aria-hidden="true"
              className={`editor-save-dot ${status === '保存未完成' ? 'is-error' : status.startsWith('已保存') && !status.includes('日期待补充') ? 'is-saved' : 'is-pending'}`}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{status}</TooltipContent>
      </Tooltip>
    </div>
  )
}
export function RecordEditorView() {
  const session = useContext(RecordEditorContext)
  const reviewTarget = useContext(DiarySidebarContext)
  const headingApplied = useRef(false)
  if (!session) throw new Error('缺少会话上下文')
  const {
    record,
    onBusy,
    onImport,
    importReport,
    mood,
    setMood,
    moodInput,
    title,
    setTitle,
    date,
    setDate,
    tags,
    setTags,
    dateOpen,
    setDateOpen,
    error,
    picker,
    lastPosition,
    article,
    locked,
    readOnly,
    tagBusy,
    setTagBusy,
    editor,
    persistence,
    busy,
    changed,
    save,
    format,
    guardInput,
    importFiles,
  } = session
  const formatState = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      underline: editor?.isActive('underline') ?? false,
      strike: editor?.isActive('strike') ?? false,
      ordered: editor?.isActive('orderedList') ?? false,
      task: editor?.isActive('taskList') ?? false,
      quote: editor?.isActive('blockquote') ?? false,
      left: editor?.isActive({ textAlign: 'left' }) ?? false,
      center: editor?.isActive({ textAlign: 'center' }) ?? false,
      right: editor?.isActive({ textAlign: 'right' }) ?? false,
      justify: editor?.isActive({ textAlign: 'justify' }) ?? false,
      headingLevel:
        ([1, 2, 3, 4, 5, 6] as const).find((level) => editor?.isActive('heading', { level })) ?? 0,
      list: editor?.isActive('bulletList') ?? false,
      color: (editor?.getAttributes('textStyle').color as string | null) ?? null,
      backgroundColor:
        (editor?.getAttributes('textStyle').backgroundColor as string | null) ?? null,
    }),
  })
  return (
    <>
      {reviewTarget &&
        editor &&
        createPortal(
          <ConnectedCopyReviewPanel editor={editor} recordId={record.id} readOnly={readOnly} />,
          reviewTarget,
        )}
      <AttachmentSurface
        scope={{
          recordId: record.id,
          revisionId: null,
          attachments: record.attachments,
          editable: !readOnly,
          imageIds: imageIds(editor?.getJSON() ?? record.document),
        }}
      >
        <article
          ref={article}
          aria-busy={readOnly}
          onBeforeInputCapture={guardInput}
          onPasteCapture={(event) => {
            guardInput(event)
            if (!locked.current) {
              const files = Array.from(event.clipboardData.files)
              if (files.length) {
                event.preventDefault()
                event.stopPropagation()
                importFiles(files, editor?.state.selection.to ?? 0)
              }
            }
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault()
          }}
          onDropCapture={(event) => {
            guardInput(event)
            if (locked.current) return
            const files = Array.from(event.dataTransfer.files)
            if (files.length) {
              event.preventDefault()
              event.stopPropagation()
              importFiles(
                files,
                editor?.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
                  editor?.state.doc.content.size ??
                  0,
              )
            }
          }}
          onCompositionStart={persistence.compositionStart}
          onCompositionEnd={persistence.compositionEnd}
          className="flex min-w-0 flex-1 flex-col bg-card"
        >
          <div className="editor-document">
            {(error || persistence.error) && (
              <p
                role="alert"
                className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error || persistence.error}{' '}
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save()}>
                  立即重试
                </Button>
              </p>
            )}
            <div className="editor-title-row">
              <input
                aria-label="记录标题"
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
                placeholder="无标题记录"
                maxLength={240}
                readOnly={readOnly}
                value={title}
                onChange={(e) => {
                  if (locked.current) return
                  setTitle(e.target.value)
                  changed()
                }}
              />
            </div>
            <div className="record-metadata">
              <Popover
                open={dateOpen && !readOnly}
                onOpenChange={(open) => {
                  if (!locked.current) setDateOpen(open)
                }}
              >
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="记录日期" disabled={readOnly}>
                    <CalendarDaysIcon aria-hidden="true" />
                    {date ? date.replace(/-/g, '/') : '选择日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-80 max-w-[calc(100vw-2rem)] p-3"
                  aria-label="选择记录日期"
                >
                  <DateFilterContent
                    value={date ? { ...blankDateCondition, start: date } : null}
                    capabilities={{
                      fields: [{ value: 'start', label: '记录日期' }],
                      operators: ['is'],
                      shortcuts: [],
                    }}
                    onChange={(condition) => {
                      if (locked.current) return
                      const next = resolveDateConstraint(condition).dateFrom ?? ''
                      if (next !== date) {
                        setDate(next)
                        changed()
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
              <TagManager
                recordId={record.id}
                tags={tags}
                disabled={readOnly}
                onBusy={(value) => {
                  setTagBusy(value)
                  onBusy(value)
                }}
                onChange={(next) => {
                  if (locked.current) return
                  setTags(next)
                  changed()
                }}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="已选标签">
                  {tags.map((tag) => (
                    <span key={tag.id} className="rounded bg-secondary px-2 py-1 text-xs">
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}
              <span className="record-mood relative inline-flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={mood ? 'p-0 text-xl leading-none' : 'p-0'}
                      disabled={readOnly}
                      aria-label={mood ? `更换心情 ${mood}` : '添加心情'}
                      onClick={() => {
                        moodInput.current?.focus()
                        void recordsApi
                          .showEmojiPicker()
                          .catch(() => toast.error('无法打开系统表情面板，请重试'))
                      }}
                    >
                      {mood ?? <SmilePlusIcon aria-hidden="true" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{mood ? '更换心情' : '添加心情'}</TooltipContent>
                </Tooltip>
                <input
                  ref={moodInput}
                  aria-label="选择心情表情"
                  className="absolute left-0 top-1/2 h-px w-px opacity-0"
                  readOnly={readOnly}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    event.currentTarget.value = ''
                    const parts = [
                      ...new (
                        Intl as unknown as {
                          Segmenter: new (
                            locale: undefined,
                            options: { granularity: 'grapheme' },
                          ) => { segment: (text: string) => Iterable<unknown> }
                        }
                      ).Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
                    ]
                    if (
                      parts.length !== 1 ||
                      !/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value)
                    ) {
                      toast.error('请选择一个表情作为心情')
                      return
                    }
                    if (!locked.current && value !== mood) {
                      setMood(value)
                      changed()
                    }
                  }}
                />
                {mood && !readOnly && (
                  <span className="record-mood-clear">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="清除心情"
                      onClick={() => {
                        if (!locked.current) {
                          setMood(null)
                          changed()
                        }
                      }}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </span>
                )}
              </span>
            </div>
            <div className="record-format" role="toolbar" aria-label="日记编辑工具">
              {(
                [
                  ['bold', '粗体', BoldIcon],
                  ['italic', '斜体', ItalicIcon],
                  ['underline', '下划线', UnderlineIcon],
                  ['strike', '删除线', StrikethroughIcon],
                  ['heading', '标题', HeadingIcon],
                  ['list', '列表', ListIcon],
                  ['ordered', '有序列表', ListOrderedIcon],
                  ['task', '任务列表', ListTodoIcon],
                  ['quote', '引用', QuoteIcon],
                ] as const
              ).map(([action, text, Icon]) =>
                action === 'heading' ? (
                  <DropdownMenu key={action}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={formatState?.headingLevel ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        aria-label="标题级别"
                        disabled={readOnly}
                      >
                        <HeadingIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      onCloseAutoFocus={(event) => {
                        if (headingApplied.current) {
                          headingApplied.current = false
                          event.preventDefault()
                          editor?.commands.focus()
                        }
                      }}
                    >
                      <DropdownMenuRadioGroup
                        value={String(formatState?.headingLevel ?? 0)}
                        onValueChange={(value) => {
                          if (!editor || readOnly) return
                          headingApplied.current = true
                          if (value === '0') editor.chain().focus().setParagraph().run()
                          else
                            editor
                              .chain()
                              .focus()
                              .setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 })
                              .run()
                        }}
                      >
                        <DropdownMenuRadioItem value="0">正文</DropdownMenuRadioItem>
                        {([1, 2, 3, 4, 5, 6] as const).map((level) => (
                          <DropdownMenuRadioItem key={level} value={String(level)}>
                            H{level}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    key={action}
                    variant={formatState?.[action] ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    aria-label={text}
                    aria-pressed={formatState?.[action] ?? false}
                    title={text}
                    disabled={readOnly}
                    onClick={() => format(action)}
                  >
                    <Icon aria-hidden="true" />
                  </Button>
                ),
              )}
              {(
                [
                  ['left', '左对齐', AlignLeftIcon],
                  ['center', '居中对齐', AlignCenterIcon],
                  ['right', '右对齐', AlignRightIcon],
                  ['justify', '两端对齐', AlignJustifyIcon],
                ] as const
              ).map(([align, label, Icon]) => (
                <Button
                  key={align}
                  variant={formatState?.[align] ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label={label}
                  aria-pressed={formatState?.[align] ?? false}
                  title={label}
                  disabled={readOnly}
                  onClick={() => editor?.chain().focus().setTextAlign(align).run()}
                >
                  <Icon aria-hidden="true" />
                </Button>
              ))}
              {(
                [
                  ['increase', '增加缩进', IndentIncreaseIcon],
                  ['decrease', '减少缩进', IndentDecreaseIcon],
                ] as const
              ).map(([direction, label, Icon]) => (
                <Button
                  key={direction}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={label}
                  title={label}
                  disabled={readOnly}
                  onClick={() => {
                    if (!editor) return
                    const listType = editor.isActive('taskList')
                      ? 'taskItem'
                      : editor.isActive('bulletList') || editor.isActive('orderedList')
                        ? 'listItem'
                        : null
                    if (listType) {
                      if (direction === 'increase')
                        editor.chain().focus().sinkListItem(listType).run()
                      else editor.chain().focus().liftListItem(listType).run()
                      return
                    }
                    const type = editor.isActive('heading') ? 'heading' : 'paragraph'
                    const current = Number(editor.getAttributes(type).indent) || 0
                    editor
                      .chain()
                      .focus()
                      .updateAttributes(type, {
                        indent: Math.max(
                          0,
                          Math.min(8, current + (direction === 'increase' ? 1 : -1)),
                        ),
                      })
                      .run()
                  }}
                >
                  <Icon aria-hidden="true" />
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="清除格式"
                title="清除格式"
                disabled={readOnly}
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .unsetAllMarks()
                    .clearNodes()
                    .updateAttributes('paragraph', { indent: 0, textAlign: null })
                    .run()
                }
              >
                <EraserIcon aria-hidden="true" />
              </Button>
              <ColorPalette
                editor={editor}
                kind="text"
                color={formatState?.color ?? null}
                disabled={readOnly}
              />
              <ColorPalette
                editor={editor}
                kind="background"
                color={formatState?.backgroundColor ?? null}
                disabled={readOnly}
              />
              {onImport && (
                <>
                  <input
                    ref={picker}
                    aria-label="选择图片文件"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="sr-only"
                    disabled={readOnly}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                      event.target.value = ''
                      importFiles(files)
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={readOnly || tagBusy}
                    onClick={() => picker.current?.click()}
                  >
                    <ImagePlusIcon data-icon="inline-start" aria-hidden="true" />
                    插入图片
                  </Button>
                </>
              )}
            </div>
            <EditorContent
              className="record-editor flex-1"
              editor={editor}
              onFocus={() => {
                lastPosition.current = editor?.state.selection.to ?? null
              }}
              onKeyUp={() => {
                lastPosition.current = editor?.state.selection.to ?? null
              }}
              onMouseUp={() => {
                lastPosition.current = editor?.state.selection.to ?? null
              }}
            />
            {importReport && (
              <div role="status" className="text-xs leading-6">
                {importReport.messages.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
                {importReport.retry.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={readOnly}
                    onClick={() => importFiles(importReport.retry)}
                  >
                    重试未成功图片
                  </Button>
                )}
              </div>
            )}
          </div>
        </article>
      </AttachmentSurface>
    </>
  )
}
