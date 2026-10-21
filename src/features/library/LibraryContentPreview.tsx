import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AttachmentImageNode } from './attachmentExtensions'
import { AttachmentSurface } from './AttachmentImage'
import { imageIds } from './imageDocument'
import { kindLabels } from './LibraryBrowser'
import type { ContentPreview } from './api'
export function LibraryContentPreview({content}:{content:ContentPreview}){
 const editor=useEditor({extensions:[StarterKit.configure({link:false}),AttachmentImageNode],content:content.document??{type:'doc',content:[{type:'paragraph'}]},editable:false,editorProps:{attributes:{'aria-label':'检索内容（只读）'}}})
 return <article className="mx-auto w-full max-w-[860px] px-7 py-6 lg:px-12"><p className="mb-3 text-xs text-muted-foreground">{kindLabels[content.kind]} · {content.recordDate} · 只读浏览</p><h2 className="mb-6 text-2xl font-semibold">{content.title||'无标题记录'}</h2><AttachmentSurface scope={{recordId:content.id,revisionId:null,imageIds:imageIds(content.document??{})}}>{content.document&&<EditorContent className="record-editor" editor={editor}/>}</AttachmentSurface>{content.messages.map((message,index)=><section key={index} className="border-t py-4"><p className="mb-2 text-xs text-muted-foreground">消息 {index+1}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{message||'（无文字）'}</p></section>)}{!content.document&&content.messages.length===0&&<p className="text-sm text-muted-foreground">这条内容没有可显示的正文。</p>}</article>
}
