import { invoke } from '@tauri-apps/api/core'
import type { ModelSelection } from './modelProfiles'

export interface CopyReviewBlock {
  id: string
  text: string
}
export interface CopyReviewResult {
  version: 1
  suggestions: {
    id: string
    category: 'typo' | 'punctuation' | 'fluency' | 'repetition' | 'wordiness' | 'consistency'
    references: { blockId: string; quote: string }[]
    reason: string
    replacement: string | null
  }[]
}

export async function requestCopyReview(
  recordId: string,
  profileId: string,
  selection: ModelSelection | null,
  blocks: CopyReviewBlock[],
  signal: AbortSignal,
): Promise<CopyReviewResult> {
  const requestId = crypto.randomUUID()
  let reserved = false
  let finished = false
  let abortHandler: (() => void) | undefined
  try {
    if (signal.aborted) throw new DOMException('审查已停止', 'AbortError')
    await invoke('copy_review_reserve', { requestId, recordId })
    reserved = true
    if (signal.aborted) {
      await invoke('copy_review_cancel', { requestId })
      throw new DOMException('审查已停止', 'AbortError')
    }
    const stopped = new Promise<never>((_, reject) => {
      abortHandler = () => {
        void invoke('copy_review_cancel', { requestId }).then(
          () => reject(new DOMException('审查已停止', 'AbortError')),
          () => reject(new Error('无法确认审查已停止，请重试')),
        )
      }
      signal.addEventListener('abort', abortHandler, { once: true })
    })
    const result = await Promise.race([
      invoke<CopyReviewResult>('copy_review_run', {
        input: {
          requestId,
          recordId,
          profileId,
          selection,
          blocks: blocks.map(({ id, text }) => ({ id, text })),
        },
      }).catch((error: unknown) => {
        if (signal.aborted) return stopped
        throw error
      }),
      stopped,
    ])
    if (signal.aborted) throw new DOMException('审查已停止', 'AbortError')
    finished = true
    return result
  } finally {
    if (abortHandler) signal.removeEventListener('abort', abortHandler)
    if (reserved && !finished) await invoke('copy_review_cancel', { requestId })
  }
}
