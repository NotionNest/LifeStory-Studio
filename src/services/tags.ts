import { invoke } from '@tauri-apps/api/core'

export interface Tag {
  id: string
  name: string
}
export interface TagUsage extends Tag {
  count: number
  current: boolean
}

export const tagsApi = {
  tagCatalog: (recordId: string) => invoke<TagUsage[]>('tag_catalog', { recordId }),
  tag: (name: string) => invoke<Tag>('tag_create', { name }),
}
