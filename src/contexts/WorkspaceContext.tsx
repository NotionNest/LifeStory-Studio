import { createContext, useContext, useState, type ReactNode } from 'react'

export interface WorkspaceState {
  sidebarOpen: boolean
  setSidebarOpen: (value: boolean) => void
  titlebarTarget: HTMLElement | null
  setTitlebarTarget: (element: HTMLDivElement | null) => void
}
export const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [titlebarTarget, setTitlebarTarget] = useState<HTMLDivElement | null>(null)
  return (
    <WorkspaceContext value={{ sidebarOpen, setSidebarOpen, titlebarTarget, setTitlebarTarget }}>
      {children}
    </WorkspaceContext>
  )
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('缺少工作区上下文')
  return value
}
