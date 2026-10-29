import { memo } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChatView } from './ChatSessionProvider'
export const ChatMaterialPicker = memo(function ChatMaterialPicker() {
  const {
    materialOpen,
    sourceInput,
    sourceKeyword,
    items,
    sources,
    sourceNext,
    busy,
    running,
    closeMaterials,
    queryMaterials,
    changeKeyword,
    chooseSource,
  } = useChatView('materials')
  return (
    <>
      {materialOpen && (
        <section
          className="flex max-h-52 flex-col gap-2 overflow-y-auto rounded border p-3"
          aria-label="附加日记"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              closeMaterials()
            }
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">选择日记</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="关闭日记选择器"
              onClick={closeMaterials}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void queryMaterials()
            }}
          >
            <Input
              ref={sourceInput}
              aria-label="查找上下文日记"
              placeholder="搜索日记"
              value={sourceKeyword}
              onChange={(e) => changeKeyword(e.target.value)}
            />
            <Button variant="outline" size="sm">
              查找
            </Button>
          </form>
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sources.includes(item.id)}
                disabled={busy || running}
                onChange={(e) => chooseSource(item.id, e.target.checked)}
              />
              {item.title || '无标题日记'}
            </label>
          ))}
          {sourceNext !== null && (
            <Button size="sm" variant="ghost" onClick={() => void queryMaterials(sourceNext)}>
              更多日记
            </Button>
          )}
        </section>
      )}
    </>
  )
})
