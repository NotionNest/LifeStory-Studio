// @vitest-environment jsdom
import { trashApi } from '@/services/trash'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { it, expect, vi } from 'vitest'
import { DeleteRecordDialog } from './DeleteRecordDialog'
vi.mock('@/services/trash', async (original) => ({
  ...(await original<typeof import('@/services/trash')>()),
  trashApi: {
    trashStatus: vi.fn().mockResolvedValue('active'),
    trashList: vi.fn(),
    trashMove: vi.fn(),
    trashImpact: vi.fn(),
    trashRestore: vi.fn(),
    trashPurge: vi.fn(),
  },
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
HTMLDialogElement.prototype.showModal = function () {
  this.open = true
}
function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  return {
    host,
    root,
    click: (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent === label)!
        .click(),
    end: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}
it('shows source impact and rereads conflicts before moving to trash', async () => {
  vi.clearAllMocks()
  const impact = {
    recordId: 'a',
    title: '合成原文',
    contentVersion: 2,
    impactToken: 'old',
    references: [{ id: 'draft', title: '独立稿件', kind: 'draft' as const }],
  }
  const done = vi.fn()
  vi.mocked(trashApi.trashMove)
    .mockRejectedValueOnce({ message: '引用影响已变化' })
    .mockResolvedValue(undefined)
  vi.mocked(trashApi.trashImpact).mockResolvedValue({ ...impact, impactToken: 'new' })
  const ui = setup()
  try {
    await act(async () =>
      ui.root.render(<DeleteRecordDialog impact={impact} onClose={vi.fn()} onDeleted={done} />),
    )
    expect(ui.host.textContent).toContain('独立稿件')
    expect(trashApi.trashMove).not.toHaveBeenCalled()
    await act(async () => ui.click('移入回收站'))
    expect(done).not.toHaveBeenCalled()
    await act(async () => ui.click('重新核对影响'))
    await act(async () => ui.click('移入回收站'))
    expect(trashApi.trashMove).toHaveBeenLastCalledWith({ ...impact, impactToken: 'new' })
    expect(done).toHaveBeenCalledOnce()
  } finally {
    await ui.end()
  }
})
it('keeps editing paused until an uncertain move is reconciled', async () => {
  vi.clearAllMocks()
  vi.mocked(trashApi.trashMove).mockRejectedValue({ message: '响应丢失' })
  vi.mocked(trashApi.trashStatus)
    .mockRejectedValueOnce(new Error('离线'))
    .mockResolvedValue('trash')
  const done = vi.fn(),
    close = vi.fn(),
    ui = setup()
  try {
    await act(async () =>
      ui.root.render(
        <DeleteRecordDialog
          impact={{
            recordId: 'a',
            title: null,
            contentVersion: 0,
            impactToken: 'token',
            references: [],
          }}
          onClose={close}
          onDeleted={done}
        />,
      ),
    )
    await act(async () => ui.click('移入回收站'))
    expect(
      [...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === '取消',
      )!.disabled,
    ).toBe(true)
    expect(done).not.toHaveBeenCalled()
    await act(async () => ui.click('重新核对影响'))
    expect(done).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
  } finally {
    await ui.end()
  }
})
