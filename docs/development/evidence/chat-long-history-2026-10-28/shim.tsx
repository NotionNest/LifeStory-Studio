import { createContext, useContext } from 'react'
export const Context = createContext<any>(null)
export function useChatView() {
  return useContext(Context)
}
