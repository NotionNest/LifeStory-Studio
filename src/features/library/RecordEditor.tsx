import { useEffect, useImperativeHandle, useRef, useState, type Ref, type FormEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { useRecordPersistence } from './useRecordPersistence'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { libraryApi, errorMessage, type RecordFile, type SaveInput, type Tag } from './api'
export interface EditorHandle { prepareLeave: () => Promise<'saved' | 'failed'>; resume: () => void; flush: () => Promise<'saved' | 'failed'>; save: () => Promise<boolean>; export: () => Promise<boolean>; discard: () => Promise<boolean> }
interface Props { record: RecordFile; sessionId: string; recovered?: SaveInput | null; recoveredTags?: Tag[]; ref: Ref<EditorHandle>; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; onSaved: () => void; onFailure: (message: string) => void }
export function RecordEditor({ record, sessionId, recovered, recoveredTags, ref, onDirty, onBusy, onSaved, onFailure }: Props) {
  const [title, setTitle] = useState(recovered ? recovered.title ?? '' : record.title ?? '')
  const [date, setDate] = useState(recovered?.recordDate ?? record.recordDate)
  const [tags, setTags] = useState(recovered ? recoveredTags ?? [] : record.tags)
  const [tagName, setTagName] = useState('')
  const [error, setError] = useState('')
  const article = useRef<HTMLElement>(null), locked = useRef(false)
  const [readOnly, setReadOnly] = useState(false)
  const [tagBusy, setTagBusy] = useState(false)
  const persistenceRef = useRef<ReturnType<typeof useRecordPersistence> | null>(null)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content: recovered?.document ?? record.document,
    onUpdate: () => persistenceRef.current?.changed(),
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '记录正文', 'aria-multiline': 'true' },
      handleDOMEvents: {
        compositionstart: () => { persistenceRef.current?.compositionStart(); return false },
        compositionend: () => { persistenceRef.current?.compositionEnd(); return false },
      },
    },
  })
  const persistence = useRecordPersistence({ record, sessionId, recovered, editor,
    content: () => ({title:title || null,recordDate:date,tagIds:tags.map(t=>t.id),document:editor?.getJSON() ?? record.document}),
    onDirty,onSaved,onFailure,
  })
  persistenceRef.current = persistence
  const { status, busy, changed, save } = persistence
  const freeze = (value: boolean) => {
    locked.current = value; setReadOnly(value); editor?.setEditable(!value, false)
    // Apply to native controls synchronously, before React commits the visual state.
    article.current?.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.readOnly = value })
  }
  useImperativeHandle(ref, () => ({
    prepareLeave: async () => {
      if (!await persistence.waitForComposition()) return 'failed'
      freeze(true)
      return persistence.flush()
    },
    resume: () => freeze(false), save,flush:persistence.flush,discard:persistence.discard,
    export: async () => {try {return await libraryApi.export(persistence.snapshot())} catch(cause) {setError(errorMessage(cause));return false}},
  }))
  useEffect(() => { onBusy(tagBusy) }, [tagBusy, onBusy])
  const addTag = async () => {
    if (locked.current || !tagName.trim() || tagBusy) return
    setTagBusy(true); onBusy(true); setError('')
    try { const tag = await libraryApi.tag(tagName); if (!tags.some(t => t.id === tag.id)) { setTags(old => [...old, tag]); changed() }; setTagName('') }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setTagBusy(false) }
  }
  const format = (action: 'bold' | 'italic' | 'heading' | 'list') => {
    if (!editor || locked.current) return
    const chain = editor.chain().focus()
    if (action === 'bold') chain.toggleBold().run()
    if (action === 'italic') chain.toggleItalic().run()
    if (action === 'heading') chain.toggleHeading({ level: 2 }).run()
    if (action === 'list') chain.toggleBulletList().run()
  }
  const guardInput = (event: FormEvent) => { if (locked.current) { event.preventDefault(); event.stopPropagation() } }
  return <article ref={article} aria-busy={readOnly} onBeforeInputCapture={guardInput} onPasteCapture={guardInput} onDropCapture={guardInput} onCompositionStart={persistence.compositionStart} onCompositionEnd={persistence.compositionEnd} className="flex min-w-0 flex-1 flex-col bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
      <div><span role="status" className="text-xs text-muted-foreground">{status}</span></div>
      <span className="text-xs text-muted-foreground">自动保存</span>
    </header>
    <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-4 px-7 py-6 lg:px-12">
      {(error || persistence.error) && <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error || persistence.error} <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save()}>立即重试</Button></p>}
      <input aria-label="记录标题" className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60" placeholder="无标题记录" maxLength={240} readOnly={readOnly} value={title} onChange={e => { if (locked.current) return; setTitle(e.target.value); changed() }} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label>记录日期 <input aria-label="记录日期" type="date" className="ml-2 rounded border bg-transparent px-2 py-1 text-foreground" readOnly={readOnly} value={date} onChange={e => { if (locked.current) return; setDate(e.target.value); changed() }} /></label>
        <span>创建于 {new Date(record.createdAt).toLocaleString()}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map(tag => <button key={tag.id} className="rounded bg-secondary px-2 py-1 text-xs" title="移除标签" aria-label={`移除标签 ${tag.name}`} disabled={readOnly} onClick={() => { if (locked.current) return; setTags(old => old.filter(t => t.id !== tag.id)); changed() }}>#{tag.name} ×</button>)}
        <input aria-label="新标签" className="w-28 border-b bg-transparent px-1 py-1 text-xs outline-none" placeholder="添加标签" maxLength={64} readOnly={readOnly} value={tagName} onChange={e => { if (!locked.current) setTagName(e.target.value) }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void addTag() } }} />
        <Button variant="ghost" size="sm" disabled={readOnly || tagBusy || busy || !tagName.trim()} onClick={() => void addTag()}>添加</Button>
      </div>
      <div className="flex gap-1 border-y py-1" role="toolbar" aria-label="正文格式">
        {([['bold', '粗体'], ['italic', '斜体'], ['heading', '标题'], ['list', '列表']] as const).map(([action, text]) => <Button key={action} variant="ghost" size="sm" disabled={readOnly} onClick={() => format(action)}>{text}</Button>)}
      </div>
      <EditorContent className="record-editor flex-1" editor={editor} />
      <footer className="border-t pt-3 text-xs text-muted-foreground">原文 · 内容自动保存在本机</footer>
    </div>
  </article>
}
