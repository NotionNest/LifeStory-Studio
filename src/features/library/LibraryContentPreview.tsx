import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AttachmentImageNode } from './attachmentExtensions'
import { AttachmentSurface } from '@/components/attachments/AttachmentImage'
import { imageIds } from './imageDocument'
import { kindLabels } from '@/lib/recordLabels'
import type { ContentPreview } from '@/services/search'
export function LibraryContentPreview({ content }: { content: ContentPreview }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), AttachmentImageNode],
    content: content.document ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
    editorProps: { attributes: { 'aria-label': '检索内容（只读）' } },
  })
  return (
    <article className="mx-auto w-full max-w-[860px] px-7 py-6 lg:px-12">
      <p className="mb-3 text-xs text-muted-foreground">
        {kindLabels[content.kind]} · {content.recordDate} · 只读浏览
      </p>
      <h2 className="mb-6 text-2xl font-semibold">{content.title || '无标题记录'}</h2>
      <AttachmentSurface
        scope={{
          recordId: content.id,
          revisionId: null,
          imageIds: imageIds(content.document ?? {}),
        }}
      >
        {content.document && <EditorContent className="record-editor" editor={editor} />}
      </AttachmentSurface>
      {content.messages.map((message, index) => (
        <section key={index} className="border-t py-4">
          <p className="mb-2 text-xs text-muted-foreground">消息 {index + 1}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">
            {message || '（无文字）'}
          </p>
        </section>
      ))}
      {(content.sources?.length ?? 0) > 0 && (
        <section className="mt-6 border-t pt-4" aria-label="来源状态">
          <h3 className="text-sm font-medium">来源</h3>
          {content.sources!.map((source) => (
            <p key={source.id} className="mt-2 text-sm text-muted-foreground">
              {source.unavailable
                ? '来源已删除或在回收站中，不再用于生成'
                : source.title || '无标题来源'}
            </p>
          ))}
        </section>
      )}
      {!content.document && content.messages.length === 0 && (
        <p className="text-sm text-muted-foreground">这条内容没有可显示的正文。</p>
      )}
    </article>
  )
}
