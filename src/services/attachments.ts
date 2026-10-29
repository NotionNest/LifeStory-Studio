import { invoke } from '@tauri-apps/api/core'
import type { EditingSession } from './records'

export interface Attachment {
  id: string
  name: string
  mediaType: string
  byteLength: number
  width: number
  height: number
}
export interface AttachmentOperation {
  recordId: string
  sessionId: string
  expectedContentVersion: number
  requestId: string
}
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export const attachmentsApi = {
  importImage: async (operation: AttachmentOperation, file: File, document: object) => {
    if (file.size > MAX_IMAGE_BYTES) throw { code: 'validation', message: '图片超过 25 MiB' }
    const bytes = new Uint8Array(await file.slice(0, MAX_IMAGE_BYTES + 1).arrayBuffer())
    const metadata = new TextEncoder().encode(
      JSON.stringify({ operation, name: file.name, document }),
    )
    if (metadata.length > 3 * 1024 * 1024) throw { code: 'validation', message: '正文超过支持范围' }
    const packet = new Uint8Array(4 + metadata.length + bytes.length)
    new DataView(packet.buffer).setUint32(0, metadata.length, true)
    packet.set(metadata, 4)
    packet.set(bytes, 4 + metadata.length)
    return invoke<{ editing: EditingSession; attachmentId: string }>('attachment_import', packet)
  },
  image: (
    recordId: string,
    attachmentId: string,
    revisionId: string | null = null,
    original = false,
  ) => invoke<ArrayBuffer>('attachment_image', { recordId, attachmentId, revisionId, original }),
  copyImage: (recordId: string, attachmentId: string, revisionId: string | null) =>
    invoke<void>('attachment_copy', { recordId, attachmentId, revisionId }),
}
