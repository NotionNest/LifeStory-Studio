import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react'

export interface WorkspaceState {
  sidebarTrigger: RefObject<HTMLButtonElement | null>
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  titlebarTarget: HTMLElement | null
  setTitlebarTarget: (element: HTMLDivElement | null) => void
}
export const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const sidebarTrigger = useRef<HTMLButtonElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [titlebarTarget, setTitlebarTarget] = useState<HTMLDivElement | null>(null)
  return (
    <WorkspaceContext
      value={{ sidebarTrigger, sidebarOpen, setSidebarOpen, titlebarTarget, setTitlebarTarget }}
    >
      {children}
    </WorkspaceContext>
  )
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('缺少工作区上下文')
  return value
}
