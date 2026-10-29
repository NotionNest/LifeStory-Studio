import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react'

export const SearchLocationContext = createContext<RefObject<string> | null>(null)

export function SearchLocationProvider({ children }: { children: ReactNode }) {
  const keyword = useRef('')
  return <SearchLocationContext value={keyword}>{children}</SearchLocationContext>
}

export function useSearchLocation() {
  const keyword = useContext(SearchLocationContext)
  if (!keyword) throw new Error('缺少搜索定位上下文')
  return keyword
}
