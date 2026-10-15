import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export function EditorProbe() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>在这里检查中文输入、换行和撤销。</p>',
    editorProps: {
      attributes: {
        'aria-label': '编辑器联通检查',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
  })

  return (
    <section aria-labelledby="editor-heading" className="flex flex-col gap-4 py-6">
      <header className="flex flex-col gap-2">
        <h2 id="editor-heading" className="text-base font-semibold">编辑器联通检查</h2>
        <p className="text-sm leading-7 text-muted-foreground">用于验证 Tiptap 加载。这段内容不保存，关闭窗口后清除。</p>
      </header>
      <EditorContent editor={editor} />
    </section>
  )
}
