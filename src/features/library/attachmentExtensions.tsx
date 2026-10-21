import { Node, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Button } from '@/components/ui/button'
import { useContext, useState } from 'react'
import { AttachmentImage, ImageViewer, AttachmentContext } from './AttachmentImage'
function ImageNode({ node, deleteNode, selected }: NodeViewProps) {
  const scope=useContext(AttachmentContext)
  const [open, setOpen] = useState(false)
  const id = String(node.attrs.attachmentId)
  return <NodeViewWrapper className="group relative my-4" data-drag-handle contentEditable={false}><button type="button" className={`block max-w-full rounded focus-visible:outline-2 focus-visible:outline-ring ${selected?'outline-2 outline-ring':''}`} aria-label="查看正文原图" onClick={() => setOpen(true)}><AttachmentImage attachmentId={id} className="max-h-[480px] max-w-full object-contain" /></button>{scope?.editable && <div className={`mt-1 ${selected?'':'hidden group-focus-within:block'}`}><Button size="xs" variant="ghost" onClick={deleteNode}>移除图片</Button><span className="ml-2 text-xs text-muted-foreground">可拖动调整位置</span></div>}{open && <ImageViewer attachmentId={id} onClose={() => setOpen(false)} />}</NodeViewWrapper>
}
export const AttachmentImageNode = Node.create({
  name: 'attachmentImage', group: 'block', atom: true, draggable: true,
  addAttributes() { return { attachmentId: { default: null } } },
  parseHTML() { return [{ tag: 'figure[data-attachment-image]', getAttrs: element => ({ attachmentId: element.getAttribute('data-attachment-image') }) }] },
  renderHTML({ node }) { return ['figure', { 'data-attachment-image': node.attrs.attachmentId }, '图片'] },
  addNodeView() { return ReactNodeViewRenderer(ImageNode) },
})
