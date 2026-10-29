// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { attachmentsApi } from '@/services/attachments'
import { AttachmentContext, AttachmentImage, type AttachmentScope } from './AttachmentImage'
vi.mock('@/services/attachments', () => ({ attachmentsApi: { image: vi.fn() } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
it('reloads only when image identity or media type changes and releases its URL', async () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:synthetic-image'),
    revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    },
  )
  vi.mocked(attachmentsApi.image).mockResolvedValue(new ArrayBuffer(2))
  const host = document.createElement('div'),
    root = createRoot(host)
  const render = (mediaType: string, name: string, revisionId: string | null = null) =>
    act(() => {
      const scope: AttachmentScope = {
        recordId: 'synthetic',
        revisionId,
        attachments: [
          {
            id: 'image',
            name,
            mediaType,
            byteLength: 2,
            width: 1,
            height: 1,
          },
        ],
      }
      root.render(
        <AttachmentContext value={scope}>
          <AttachmentImage attachmentId="image" original />
        </AttachmentContext>,
      )
    })
  try {
    await render('image/png', '原名称')
    await render('image/png', '新名称')
    expect(attachmentsApi.image).toHaveBeenCalledTimes(1)
    expect(host.querySelector('img')?.alt).toBe('新名称')
    await render('image/jpeg', '新名称')
    expect(attachmentsApi.image).toHaveBeenCalledTimes(2)
    expect(createObjectURL.mock.calls[1][0].type).toBe('image/jpeg')
    await render('image/jpeg', '新名称', 'history')
    expect(attachmentsApi.image).toHaveBeenLastCalledWith('synthetic', 'image', 'history', true)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  } finally {
    await act(() => root.unmount())
  }
  expect(revokeObjectURL).toHaveBeenCalledTimes(3)
})
