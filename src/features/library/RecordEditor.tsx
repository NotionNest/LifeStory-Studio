import {
  recordsApi,
  type RecordFile,
  type SaveInput,
  type EditingSession,
} from '@/services/records'
import { createContext, useContext, type ReactNode } from 'react'
import {
  BoldIcon,
  ItalicIcon,
  Heading2Icon,
  ListIcon,
  ImagePlusIcon,
  CalendarDaysIcon,
} from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, useState, type Ref, type FormEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { AttachmentSurface } from '@/components/attachments/AttachmentImage'
import { AttachmentImageNode } from './attachmentExtensions'
import { closeHistory } from '@tiptap/pm/history'
import { imageIds } from './imageDocument'
import { useRecordPersistence } from './useRecordPersistence'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { TagManager } from './TagManager'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
    extensions: [StarterKit.configure({ link: false }), AttachmentImageNode],
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
  const format = (action: 'bold' | 'italic' | 'heading' | 'list') => {
    if (!editor || locked.current) return
    const chain = editor.chain().focus()
    if (action === 'bold') chain.toggleBold().run()
    if (action === 'italic') chain.toggleItalic().run()
    if (action === 'heading') chain.toggleHeading({ level: 2 }).run()
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
      <RecordEditorView />
    </RecordEditorSession>
  )
}
export function RecordEditorView() {
  const session = useContext(RecordEditorContext)
  if (!session) throw new Error('缺少会话上下文')
  const {
    record,
    onBusy,
    onImport,
    importReport,
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
  } = session
  return (
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
        <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-2">
          <div>
            <span role="status" className="text-xs text-muted-foreground">
              {status}
            </span>
          </div>
        </header>
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
          <input
            aria-label="记录标题"
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
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
          <div className="record-format" role="toolbar" aria-label="日记编辑工具">
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
            <span aria-hidden="true" className="mx-1 h-4 shrink-0 border-l" />
            {(
              [
                ['bold', '粗体', BoldIcon],
                ['italic', '斜体', ItalicIcon],
                ['heading', '标题', Heading2Icon],
                ['list', '列表', ListIcon],
              ] as const
            ).map(([action, text, Icon]) => (
              <Button
                key={action}
                variant="ghost"
                size="icon-sm"
                aria-label={text}
                title={text}
                disabled={readOnly}
                onClick={() => format(action)}
              >
                <Icon aria-hidden="true" />
              </Button>
            ))}
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
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="已选标签">
              {tags.map((tag) => (
                <span key={tag.id} className="rounded bg-secondary px-2 py-1 text-xs">
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
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
  )
}
