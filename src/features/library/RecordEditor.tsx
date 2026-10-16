import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { libraryApi, errorMessage, type RecordFile, type SaveInput, type Tag } from './api'
export interface EditorHandle { save: () => Promise<boolean>; export: () => Promise<boolean>; discard: () => Promise<boolean> }
interface Props { record: RecordFile; sessionId: string; recovered?: SaveInput | null; recoveredTags?: Tag[]; ref: Ref<EditorHandle>; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; onSaved: () => void; onFailure: (message: string) => void }
export function RecordEditor({ record, sessionId, recovered, recoveredTags, ref, onDirty, onBusy, onSaved, onFailure }: Props) {
  const [title, setTitle] = useState(recovered ? recovered.title ?? '' : record.title ?? '')
  const [date, setDate] = useState(recovered?.recordDate ?? record.recordDate)
  const [tags, setTags] = useState(recovered ? recoveredTags ?? [] : record.tags)
  const [tagName, setTagName] = useState('')
  const [status, setStatus] = useState(recovered ? '已恢复，等待保存' : '已保存')
  const [recoveryStatus, setRecoveryStatus] = useState(recovered ? '恢复草稿已保存在本机' : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tagBusy, setTagBusy] = useState(false)
  const sequence = useRef(recovered ? 1 : 0), savedSequence = useRef(0), revision = useRef(record.revisionId)
  const pending = useRef<SaveInput | null>(null), saving = useRef(false), drafting = useRef(false)
  const composing = useRef(false), mounted = useRef(true), autoPaused = useRef(false), draftPaused = useRef(false)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const maximum = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const draftMaximum = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const operations = useRef({ save: async () => false, draft: async () => {} })
  const fields = useRef({ title, date, tags })
  fields.current = { title, date, tags }
  const clearSaveTimers = () => { clearTimeout(idle.current); clearTimeout(maximum.current); idle.current = undefined; maximum.current = undefined }
  const clearDraftTimers = () => { clearTimeout(draftIdle.current); clearTimeout(draftMaximum.current); draftIdle.current = undefined; draftMaximum.current = undefined }
  const schedule = () => {
    if (!mounted.current || composing.current) return
    if (!autoPaused.current) {
      clearTimeout(idle.current)
      idle.current = setTimeout(() => { clearSaveTimers(); void operations.current.save() }, 1000)
      maximum.current ??= setTimeout(() => { clearSaveTimers(); void operations.current.save() }, 5000)
    }
    if (!draftPaused.current) {
      clearTimeout(draftIdle.current)
      draftIdle.current = setTimeout(() => { clearDraftTimers(); void operations.current.draft() }, 300)
      draftMaximum.current ??= setTimeout(() => { clearDraftTimers(); void operations.current.draft() }, 2000)
    }
  }
  const changed = () => { sequence.current++; setStatus(autoPaused.current ? '未保存，自动保存已暂停' : '未保存'); onDirty(true); schedule() }
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content: recovered?.document ?? record.document,
    onUpdate: changed,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '记录正文', 'aria-multiline': 'true' },
      handleDOMEvents: {
        compositionstart: () => { composing.current = true; clearSaveTimers(); clearDraftTimers(); return false },
        compositionend: () => { composing.current = false; schedule(); return false },
      },
    },
  })
  const snapshot = (): SaveInput => ({
    recordId: record.id, baseRevisionId: revision.current, requestId: crypto.randomUUID(), sessionId,
    editSequence: sequence.current, title: fields.current.title || null, recordDate: fields.current.date,
    tagIds: fields.current.tags.map(t => t.id), document: editor?.getJSON() ?? record.document, attachmentIds: [],
  })
  const persistDraft = async () => {
    if (!editor || drafting.current || draftPaused.current || composing.current || editor.view.composing || sequence.current <= savedSequence.current) return
    drafting.current = true
    const input = snapshot()
    try {
      const accepted = await libraryApi.writeRecovery(input)
      if (mounted.current && accepted && sequence.current > savedSequence.current) setRecoveryStatus('恢复草稿已保存在本机')
    } catch (cause) {
      if (mounted.current) {
        draftPaused.current = true; autoPaused.current = true; clearSaveTimers(); clearDraftTimers()
        const message = `恢复草稿写入失败：${errorMessage(cause)}。请手动保存后继续。`
        setRecoveryStatus('恢复保护未更新'); setError(message); onFailure(message)
      }
    } finally {
      drafting.current = false
      if (mounted.current && sequence.current > input.editSequence && sequence.current > savedSequence.current) schedule()
    }
  }
  const save = async (): Promise<boolean> => {
    if (!editor || saving.current || composing.current || editor.view.composing || tagBusy) return false
    clearSaveTimers()
    if (sequence.current === savedSequence.current && !pending.current) return true
    saving.current = true; setBusy(true); onBusy(true); setError(''); setStatus('保存中…')
    try {
      const input = pending.current ?? snapshot()
      pending.current = input
      const result = await libraryApi.save(input)
      revision.current = result.revisionId; pending.current = null; savedSequence.current = input.editSequence
      const clean = sequence.current === savedSequence.current
      if (mounted.current) {
        autoPaused.current = false; draftPaused.current = false
        if (clean) { clearDraftTimers(); setRecoveryStatus('') }
        setStatus(clean ? '已保存' : '仍有未保存修改'); onDirty(!clean); onSaved()
      }
      return clean
    } catch (cause) {
      if (typeof cause === 'object' && cause !== null && 'code' in cause && ['conflict', 'validation', 'not_found'].includes(String(cause.code))) pending.current = null
      if (mounted.current) {
        autoPaused.current = true; clearSaveTimers()
        const message = `${errorMessage(cause)}。自动保存已暂停，请手动重试。`
        setError(message); onFailure(message); setStatus('保存失败'); onDirty(true)
      }
      return false
    } finally {
      saving.current = false
      if (mounted.current) {
        setBusy(false); onBusy(false)
        if (sequence.current > savedSequence.current) schedule()
      }
    }
  }
  operations.current = { save, draft: persistDraft }
  useImperativeHandle(ref, () => ({
    save,
    export: async () => { try { return await libraryApi.export(snapshot()) } catch (cause) { setError(errorMessage(cause)); return false } },
    discard: async () => {
      clearSaveTimers(); clearDraftTimers(); autoPaused.current = true; draftPaused.current = true
      try { await libraryApi.end(record.id, sessionId); return true }
      catch (cause) { const message = errorMessage(cause); setError(message); onFailure(message); return false }
    },
  }))
  const saveRef = useRef(save); saveRef.current = save
  useEffect(() => {
    mounted.current = true
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveRef.current() } }
    window.addEventListener('keydown', key)
    return () => { mounted.current = false; clearSaveTimers(); clearDraftTimers(); window.removeEventListener('keydown', key) }
  }, [])
  useEffect(() => { if (editor && recovered) { onDirty(true); schedule() } }, [editor])
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
  return <article onCompositionStart={() => { composing.current = true; clearSaveTimers(); clearDraftTimers() }} onCompositionEnd={() => { composing.current = false; schedule() }} className="flex min-w-0 flex-1 flex-col bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
      <div><span role="status" className="text-xs text-muted-foreground">{status}</span>{recoveryStatus && <span className="ml-3 text-xs text-muted-foreground">{recoveryStatus}</span>}</div>
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
      <footer className="border-t pt-3 text-xs text-muted-foreground">原文 · 自动保存到本机 · 也可随时手动保存</footer>
    </div>
  </article>
}
