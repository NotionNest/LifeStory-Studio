import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/utils'

export function WorkspaceSidebar({
  id,
  label,
  open,
  className,
  children,
  returnFocusRef,
}: {
  returnFocusRef: RefObject<HTMLButtonElement | null>
  id: string
  label: string
  open: boolean
  className?: string
  children: ReactNode
}) {
  const sidebar = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!open && sidebar.current?.contains(document.activeElement)) {
      returnFocusRef.current?.focus()
    }
  }, [open, returnFocusRef])
  return (
    <aside
      ref={sidebar}
      id={id}
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      data-state={open ? 'open' : 'closed'}
      className="workspace-sidebar"
    >
      <div className={cn('workspace-sidebar-content', className)}>{children}</div>
    </aside>
  )
}
