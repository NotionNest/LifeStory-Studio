// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect,it,vi } from 'vitest'
import { MessageDetails,ReasoningSummary } from './MessageDetails'
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
it('copies only the answer, reports errors and shows stored time and duration',async()=>{
 const host=document.createElement('div'),root=createRoot(host),copy=vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}})
 try{await act(()=>root.render(<><ReasoningSummary text="合成摘要"/><MessageDetails text="合成答复" createdAt={1000} durationMs={1250}/></>));expect(host.querySelector('time')!.dateTime).toBe(new Date(1000).toISOString());expect(host.textContent).toContain('1.3 秒');expect(host.querySelector('details')!.open).toBe(false);await act(async()=>host.querySelector('button')!.click());expect(host.querySelector('[role="alert"]')).not.toBeNull();await act(async()=>host.querySelector('button')!.click());expect(copy).toHaveBeenLastCalledWith('合成答复');expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.querySelector('[aria-label="已复制消息"]')).not.toBeNull()}finally{await act(()=>root.unmount())}
})
it('updates elapsed time while running and does not invent missing historical metadata',async()=>{
 vi.useFakeTimers();vi.setSystemTime(10000);const host=document.createElement('div'),root=createRoot(host)
 try{await act(()=>root.render(<><ReasoningSummary text="合成摘要" running/><MessageDetails startedAt={9000} running/></>));expect(host.querySelector('details')!.open).toBe(true);expect(host.textContent).toContain('1.0 秒');await act(()=>vi.advanceTimersByTime(2000));expect(host.textContent).toContain('3.0 秒');await act(()=>root.render(<MessageDetails/>));expect(host.textContent).toBe('');expect(host.querySelector('time')).toBeNull()}finally{await act(()=>root.unmount());vi.useRealTimers()}
})
