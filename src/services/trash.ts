import { invoke } from '@tauri-apps/api/core'
import type { RecordKind } from './records'

export interface DeleteImpact {
  recordId: string
  title: string | null
  contentVersion: number
  impactToken: string
  references: { id: string; title: string | null; kind: RecordKind }[]
}
export interface TrashItem {
  id: string
  title: string | null
  kind: RecordKind
  recordDate: string
  deletedAt: number
  purgeAt: number
}
export interface TrashPage {
  items: TrashItem[]
  nextOffset: number | null
  cleanupError: string | null
}

export const trashApi = {
  trashStatus: (recordId: string) =>
    invoke<'active' | 'trash' | 'missing'>('trash_status', { recordId }),
  trashImpact: (recordId: string) => invoke<DeleteImpact>('trash_impact', { recordId }),
  trashMove: (impact: DeleteImpact) =>
    invoke<void>('trash_move', {
      input: {
        recordId: impact.recordId,
        expectedContentVersion: impact.contentVersion,
        expectedImpact: impact.impactToken,
      },
    }),
  trashList: (offset = 0, domain: 'diary' | 'chat' = 'diary') =>
    invoke<TrashPage>('trash_list', { offset, domain }),
  trashRestore: (item: TrashItem) =>
    invoke<void>('trash_restore', { recordId: item.id, deletedAt: item.deletedAt }),
  trashPurge: (item: TrashItem) =>
    invoke<void>('trash_purge', { recordId: item.id, deletedAt: item.deletedAt }),
}
