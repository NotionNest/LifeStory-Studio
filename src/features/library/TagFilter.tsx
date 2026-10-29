import { useEffect, useState } from 'react'
import { TagIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { Tag } from '@/services/tags'
import type { Filters } from './useLibraryQuery'

export function TagFilter({
  filters,
  tags,
  active,
  onChange,
}: {
  filters: Filters
  tags: Tag[]
  active: boolean
  onChange: (next: Filters) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!active) setOpen(false)
  }, [active])
  const names = filters.tagIds.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean)
  const label = names.length ? `标签：${names.join('、')}` : '标签'
  return (
    <Popover open={active && open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={filters.tagIds.length ? 'secondary' : 'ghost'}
          aria-label={label}
          className="max-w-56"
        >
          <TagIcon aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] p-1"
        aria-label="标签筛选"
      >
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <NativeSelect
            size="sm"
            aria-label="标签匹配方式"
            value={filters.tagMode}
            onChange={(event) =>
              onChange({ ...filters, tagMode: event.target.value as 'all' | 'any' })
            }
          >
            <NativeSelectOption value="all">包含全部</NativeSelectOption>
            <NativeSelectOption value="any">包含任一</NativeSelectOption>
          </NativeSelect>
          {filters.tagIds.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => onChange({ ...filters, tagIds: [] })}>
              清除标签
            </Button>
          )}
        </div>
        <Command>
          <CommandInput aria-label="搜索标签" placeholder="搜索标签…" />
          <CommandList className="max-h-64">
            <CommandEmpty>无匹配标签</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => {
                const checked = filters.tagIds.includes(tag.id)
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.id}
                    keywords={[tag.name]}
                    data-checked={checked}
                    disabled={!checked && filters.tagIds.length >= 50}
                    onSelect={() =>
                      onChange({
                        ...filters,
                        tagIds: checked
                          ? filters.tagIds.filter((id) => id !== tag.id)
                          : [...filters.tagIds, tag.id],
                      })
                    }
                  >
                    <TagIcon aria-hidden="true" />
                    {tag.name}
                    {checked && <span className="sr-only">已选择</span>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
