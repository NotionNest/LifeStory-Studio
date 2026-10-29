import { createContext, useContext } from 'react'
import type { useDiaryEditing } from './useDiaryEditing'
type DiaryViews = ReturnType<typeof useDiaryEditing>['views']
export const DiarySessionContext = createContext<DiaryViews | null>(null)
export function useDiary() {
  const value = useContext(DiarySessionContext)
  if (!value) throw new Error('缺少日记编辑会话')
  return value
}
