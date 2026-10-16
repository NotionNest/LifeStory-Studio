import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { libraryApi, errorMessage, type RecordFile, type SaveInput } from './api'
export interface EditorHandle { save: () => Promise<boolean>; export: () => Promise<boolean> }
interface Props { record: RecordFile; ref: Ref<EditorHandle>; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; onSaved: () => void; onFailure: (message: string) => void }
export function RecordEditor({ record, ref, onDirty, onBusy, onSaved, onFailure }: Props) {
  const [title, setTitle] = useState(record.title ?? '')
  const [date, setDate] = useState(record.recordDate)
  const [tags, setTags] = useState(record.tags)
  const [tagName, setTagName] = useState('')
  const [status, setStatus] = useState('已保存')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tagBusy, setTagBusy] = useState(false)
  const sequence = useRef(0), savedSequence = useRef(0), revision = useRef(record.revisionId)
  const session = useRef(crypto.randomUUID()), pending = useRef<SaveInput | null>(null), saving = useRef(false)
  const fields = useRef({ title, date, tags })
  fields.current = { title, date, tags }
  const changed = () => { sequence.current++; setStatus('未保存'); onDirty(true) }
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content: record.document,
    onUpdate: changed,
    editorProps: { attributes: { role: 'textbox', 'aria-label': '记录正文', 'aria-multiline': 'true' } },
  })
  const snapshot = (): SaveInput => ({
    recordId: record.id, baseRevisionId: revision.current, requestId: crypto.randomUUID(), sessionId: session.current,
    editSequence: sequence.current, title: fields.current.title || null, recordDate: fields.current.date,
    tagIds: fields.current.tags.map(t => t.id), document: editor?.getJSON() ?? record.document, attachmentIds: [],
  })
  const save = async (): Promise<boolean> => {
    if (!editor || saving.current || editor.view.composing || tagBusy) return false
    if (sequence.current === savedSequence.current && !pending.current) return true
    saving.current = true; setBusy(true); onBusy(true); setError(''); setStatus('保存中…')
    try {
      // A retry must replay the exact uncertain request before sending newer edits.
      const input = pending.current ?? snapshot()
      pending.current = input
      const result = await libraryApi.save(input)
      revision.current = result.revisionId
      pending.current = null
      savedSequence.current = input.editSequence
      const clean = sequence.current === savedSequence.current
      setStatus(clean ? '已保存' : '仍有未保存修改'); onDirty(!clean); onSaved()
      return clean
    } catch (cause) {
      if (typeof cause === 'object' && cause !== null && 'code' in cause && ['conflict', 'validation', 'not_found'].includes(String(cause.code))) pending.current = null
      setError(errorMessage(cause)); onFailure(errorMessage(cause)); setStatus('保存失败'); onDirty(true); return false
    } finally { saving.current = false; setBusy(false); onBusy(false) }
  }
  useImperativeHandle(ref, () => ({
    save,
    export: async () => {
      try { return await libraryApi.export(snapshot()) } catch (cause) { setError(errorMessage(cause)); return false }
    },
  }))
  const saveRef = useRef(save); saveRef.current = save
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveRef.current() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const addTag = async () => {
    if (!tagName.trim() || tagBusy) return
    setTagBusy(true); onBusy(true); setError('')
    try { const tag = await libraryApi.tag(tagName); if (!fields.current.tags.some(t => t.id === tag.id)) { setTags(old => [...old, tag]); changed() }; setTagName('') }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setTagBusy(false); onBusy(saving.current) }
  }
  const format = (action: 'bold' | 'italic' | 'heading' | 'list') => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (action === 'bold') chain.toggleBold().run()
    if (action === 'italic') chain.toggleItalic().run()
    if (action === 'heading') chain.toggleHeading({ level: 2 }).run()
    if (action === 'list') chain.toggleBulletList().run()
  }
  return <article className="flex min-w-0 flex-1 flex-col bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
      <span role="status" className="text-xs text-muted-foreground">{status}</span>
      <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">⌘S / Ctrl+S</span><Button size="sm" onClick={() => void save()} disabled={busy || tagBusy}>保存</Button></div>
    </header>
    <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-4 px-7 py-6 lg:px-12">
      {error && <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <input aria-label="记录标题" className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60" placeholder="无标题记录" maxLength={240} value={title} onChange={e => { setTitle(e.target.value); changed() }} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label>记录日期 <input aria-label="记录日期" type="date" className="ml-2 rounded border bg-transparent px-2 py-1 text-foreground" value={date} onChange={e => { setDate(e.target.value); changed() }} /></label>
        <span>创建于 {new Date(record.createdAt).toLocaleString()}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map(tag => <button key={tag.id} className="rounded bg-secondary px-2 py-1 text-xs" title="移除标签" aria-label={`移除标签 ${tag.name}`} onClick={() => { setTags(old => old.filter(t => t.id !== tag.id)); changed() }}>#{tag.name} ×</button>)}
        <input aria-label="新标签" className="w-28 border-b bg-transparent px-1 py-1 text-xs outline-none" placeholder="添加标签" maxLength={64} value={tagName} onChange={e => setTagName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void addTag() } }} />
        <Button variant="ghost" size="sm" disabled={tagBusy || busy || !tagName.trim()} onClick={() => void addTag()}>添加</Button>
      </div>
      <div className="flex gap-1 border-y py-1" role="toolbar" aria-label="正文格式">
        {([['bold', '粗体'], ['italic', '斜体'], ['heading', '标题'], ['list', '列表']] as const).map(([action, text]) => <Button key={action} variant="ghost" size="sm" onClick={() => format(action)}>{text}</Button>)}
      </div>
      <EditorContent className="record-editor flex-1" editor={editor} />
      <footer className="border-t pt-3 text-xs text-muted-foreground">原文 · 本地资料库 · 请使用保存按钮或快捷键保存修改</footer>
    </div>
  </article>
}
