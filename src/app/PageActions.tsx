import { useRef, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { EllipsisIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

export interface PageAction {
 id: string
 label: string
 icon: ComponentType<{className?: string; 'aria-hidden'?: boolean}>
 onSelect: () => void
 disabled?: boolean
 primary?: boolean
 destructive?: boolean
}

export function PageActions({target,actions}:{target:HTMLElement|null;actions:PageAction[]}){
 const pending=useRef<(()=>void)|null>(null),trigger=useRef<HTMLButtonElement>(null)
 if(!target)return null
 const menu=actions.filter(action=>!action.primary)
 return createPortal(<>
  {actions.filter(action=>action.primary).map(action=><Button key={action.id} variant="ghost" size="icon-sm" aria-label={action.label} disabled={action.disabled} onClick={action.onSelect}><action.icon aria-hidden={true}/></Button>)}
  {menu.length>0&&<DropdownMenu><DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" size="icon-sm" aria-label="更多操作" disabled={menu.every(action=>action.disabled)}><EllipsisIcon aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent className="w-44" align="end" sideOffset={4} onCloseAutoFocus={event=>{const action=pending.current;pending.current=null;if(action){event.preventDefault();trigger.current?.focus();action()}}}>
   <DropdownMenuGroup>{menu.filter(action=>!action.destructive).map(action=><DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={()=>{pending.current=action.onSelect}}><action.icon aria-hidden={true}/>{action.label}</DropdownMenuItem>)}</DropdownMenuGroup>
   {menu.some(action=>action.destructive)&&<>{menu.some(action=>!action.destructive)&&<DropdownMenuSeparator/>}<DropdownMenuGroup>{menu.filter(action=>action.destructive).map(action=><DropdownMenuItem key={action.id} variant="destructive" disabled={action.disabled} onSelect={()=>{pending.current=action.onSelect}}><action.icon aria-hidden={true}/>{action.label}</DropdownMenuItem>)}</DropdownMenuGroup></>}
  </DropdownMenuContent></DropdownMenu>}
 </>,target)
}
