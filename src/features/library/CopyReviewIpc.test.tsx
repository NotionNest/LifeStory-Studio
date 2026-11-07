// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { ConnectedCopyReviewPanel } from './ConnectedCopyReviewPanel'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@/contexts/ModelProfilesContext', () => ({
  useModelProfiles: () => ({
    profilesLoaded: true,
    preferences: { defaultProfileId: 'profile' },
    profiles: [
      {
        id: 'profile',
        label: '测试服务',
        protocol: 'chat',
        baseUrl: 'https://invalid.example',
        model: 'test',
        hasKey: true,
      },
    ],
  }),
}))
vi.mock('@/components/ModelControls', () => ({ ModelControls: () => <button>模型</button> }))

it('passes only the current text snapshot through the review commands', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const calls = vi.mocked(invoke)
  calls.mockReset()
  calls.mockImplementation(async (command) =>
    command === 'copy_review_run'
      ? {
          version: 1,
          suggestions: [
            {
              id: 'one',
              category: 'typo',
              references: [{ blockId: 'b1', quote: '觉的' }],
              reason: '疑似错别字',
              replacement: '觉得',
            },
          ],
        }
      : undefined,
  )
  const host = document.createElement('div')
  document.body.append(host)
  const editor = new Editor({ extensions: [StarterKit], content: '<p>觉的不错</p>' })
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(<ConnectedCopyReviewPanel editor={editor} recordId="diary" readOnly={false} />),
    )
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '开始审查')!
        .click(),
    )
    const run = calls.mock.calls.find(([command]) => command === 'copy_review_run')!
    const input = (run[1] as { input: { blocks: unknown[]; recordId: string; profileId: string } })
      .input
    expect(input.blocks).toEqual([{ id: 'b1', text: '觉的不错' }])
    expect(input.recordId).toBe('diary')
    expect(input.profileId).toBe('profile')
    expect(host.textContent).toContain('疑似错别字')
    expect(editor.view.dom.querySelector('[data-review-id="one"]')).not.toBeNull()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="采纳建议"]')!.click(),
    )
    expect(editor.getText()).toBe('觉得不错')
  } finally {
    await act(async () => root.unmount())
    editor.destroy()
    host.remove()
  }
})
