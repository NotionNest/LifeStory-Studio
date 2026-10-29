import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'

type SavedDiaryAction = (action: () => Promise<void>) => Promise<void>
interface DiaryActions {
  register: (action: SavedDiaryAction) => () => void
  withSavedDiary: SavedDiaryAction
}
const DiaryActionsContext = createContext<DiaryActions | null>(null)

export function DiaryActionsProvider({ children }: { children: ReactNode }) {
  const current = useRef<SavedDiaryAction | null>(null)
  const register = useCallback((action: SavedDiaryAction) => {
    current.current = action
    return () => {
      if (current.current === action) current.current = null
    }
  }, [])
  const withSavedDiary = useCallback<SavedDiaryAction>(async (action) => {
    if (!current.current) throw new Error('日记编辑器尚未准备好')
    await current.current(action)
  }, [])
  return <DiaryActionsContext value={{ register, withSavedDiary }}>{children}</DiaryActionsContext>
}

export function useDiaryActions() {
  const value = useContext(DiaryActionsContext)
  if (!value) throw new Error('缺少日记操作上下文')
  return value
}
