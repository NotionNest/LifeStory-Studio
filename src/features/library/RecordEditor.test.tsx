// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordEditor, type EditorHandle } from './RecordEditor'
import { libraryApi, type RecordFile, type SaveResult } from './api'
vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), libraryApi: { save: vi.fn(), end: vi.fn().mockResolvedValue(undefined), tag: vi.fn(), export: vi.fn() } }))
const record: RecordFile = { id: 'entry', title: null, recordDate: '2026-10-15', createdTimezone: 'Asia/Shanghai', createdAt: 0, updatedAt: 0, contentVersion: 0, checkpointId: 'revision-one', document: { type: 'doc', content: [{ type: 'paragraph' }] }, tags: [] }
let root: Root, host: HTMLDivElement
const dirty = vi.fn()
const ref = createRef<EditorHandle>()
function title(value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function result(): SaveResult { return { recordId: 'entry', contentVersion: 1, checkpointId: 'revision-two', requestId: 'request', sessionId: 'session', editSequence: 1, savedAt: 1 } }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers(); vi.clearAllMocks(); vi.mocked(libraryApi.save).mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(<RecordEditor ref={ref} record={record} sessionId="session" onDirty={dirty} onBusy={() => {}} onSaved={() => {}} onFailure={() => {}} />) })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
describe('record saving user state', () => {
  it('retains edits on failure and retries the identical uncertain request', async () => {
    vi.mocked(libraryApi.save).mockRejectedValueOnce({ code: 'write_failed', message: '合成写入失败' }).mockResolvedValueOnce(result())
    await act(async () => title('保留这段内容'))
    let success = true
    await act(async () => { success = await ref.current!.save() })
    expect(success).toBe(false)
    expect(host.querySelector<HTMLInputElement>('[aria-label="记录标题"]')!.value).toBe('保留这段内容')
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('合成写入失败')
    await act(async () => { success = await ref.current!.save() })
    expect(success).toBe(true)
    expect(vi.mocked(libraryApi.save).mock.calls[0][0]).toEqual(vi.mocked(libraryApi.save).mock.calls[1][0])
  })
  it('does not mark newer edits saved when an older response arrives', async () => {
    let resolve!: (value: SaveResult) => void
    vi.mocked(libraryApi.save).mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValueOnce({ ...result(), contentVersion: 0, checkpointId: 'revision-three' })
    await act(async () => title('第一稿'))
    let saving!: Promise<boolean>
    await act(async () => { saving = ref.current!.save() })
    await act(async () => title('保存期间继续写'))
    let clean = true
    await act(async () => { resolve(result()); clean = await saving })
    expect(clean).toBe(false); expect(dirty).toHaveBeenLastCalledWith(true)
    expect(host.querySelector('[role="status"]')!.textContent).toContain('新修改')
    await act(async () => { await ref.current!.save() })
    expect(vi.mocked(libraryApi.save).mock.calls[1][0]).toMatchObject({ baseContentVersion: 1, baseCheckpointId: 'revision-two', title: '保存期间继续写' })
  })
  it('uses one automatic persistence pipeline without a separate recovery write', async () => {
    vi.mocked(libraryApi.save).mockResolvedValue(result())
    await act(async () => title('自动保存内容'))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="status"]')!.textContent).toBe('已保存到本机')
    expect([...host.querySelectorAll('button')].some(b => b.textContent === '保存')).toBe(false)
  })
  it('persists within two seconds during continuous input', async () => {
    vi.mocked(libraryApi.save).mockResolvedValue(result())
    await act(async () => title('开始'))
    for (let i = 0; i < 9; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(200); title(`连续输入${i}`) })
    }
    expect(libraryApi.save).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
    expect(vi.mocked(libraryApi.save).mock.calls[0][0].title).toBe('连续输入8')
  })
  it('automatically retries transient failures using the same uncertain request', async () => {
    vi.mocked(libraryApi.save).mockRejectedValueOnce({ code: 'storage_busy', message: '合成失败' }).mockResolvedValueOnce(result())
    await act(async () => title('失败仍保留'))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('自动重试')
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(libraryApi.save).toHaveBeenCalledTimes(2)
    expect(vi.mocked(libraryApi.save).mock.calls[0][0]).toEqual(vi.mocked(libraryApi.save).mock.calls[1][0])
    expect(dirty).toHaveBeenLastCalledWith(false)
  })
  it('keeps conflicts paused when input changes, without automatic overwrites', async () => {
    vi.mocked(libraryApi.save).mockRejectedValue({code:'conflict',message:'会话已变化'})
    await act(async () => title('不能覆盖'))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    await act(async () => title('仍保留在编辑器'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
    expect(dirty).toHaveBeenLastCalledWith(true)
  })
  it('does not let continuing input bypass the retry delay', async () => {
    vi.mocked(libraryApi.save).mockRejectedValue({code:'storage_busy',message:'暂忙'})
    await act(async()=>title('第一稿'))
    await act(async()=>{await vi.advanceTimersByTimeAsync(300)})
    for(let i=0;i<4;i++) await act(async()=>{await vi.advanceTimersByTimeAsync(200);title(`继续${i}`)})
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
    await act(async()=>{await vi.advanceTimersByTimeAsync(300)})
    expect(libraryApi.save).toHaveBeenCalledTimes(2)
  })
  it('does not automatically retry permission failures even after more editing', async () => {
    vi.mocked(libraryApi.save).mockRejectedValue({code:'storage_permission',message:'不可写'})
    await act(async()=>title('保留'))
    await act(async()=>{await vi.advanceTimersByTimeAsync(300)})
    await act(async()=>title('继续保留'))
    await act(async()=>{await vi.advanceTimersByTimeAsync(60000)})
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
  })
  it('flushes newer input after an older in-flight save without treating it as failure', async () => {
    let resolve!:(value:SaveResult)=>void
    vi.mocked(libraryApi.save).mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValueOnce({...result(),contentVersion:2})
    await act(async()=>title('A'))
    await act(async()=>{await vi.advanceTimersByTimeAsync(300)})
    await act(async()=>title('AB'))
    let flushing!:Promise<'saved'|'failed'>
    await act(async()=>{flushing=ref.current!.flush()})
    let flushed=''
    await act(async()=>{resolve(result());flushed=await flushing})
    expect(flushed).toBe('saved')
    expect(libraryApi.save).toHaveBeenCalledTimes(2)
    expect(vi.mocked(libraryApi.save).mock.calls[1][0]).toMatchObject({title:'AB',baseContentVersion:1})
    expect(dirty).toHaveBeenLastCalledWith(false)
  })
  it('does not persist half-composed input, then resumes after composition ends', async () => {
    vi.mocked(libraryApi.save).mockResolvedValue(result())
    const body = host.querySelector('[aria-label="记录标题"]')!
    await act(async () => { body.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); title('组合输入期间') })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(libraryApi.save).not.toHaveBeenCalled()
    await act(async () => { body.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(libraryApi.save).toHaveBeenCalledTimes(1)
  })

})
