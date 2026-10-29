import { tagsApi, type Tag, type TagUsage } from '@/services/tags'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TagIcon, SearchIcon, PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group'
import { errorMessage } from '@/lib/errors'

export function TagManager({
  recordId,
  tags,
  disabled,
  onChange,
  onBusy,
}: {
  recordId: string
  tags: Tag[]
  disabled: boolean
  onChange: (tags: Tag[]) => void
  onBusy: (busy: boolean) => void
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState('all'),
    [search, setSearch] = useState(''),
    [catalog, setCatalog] = useState<TagUsage[]>([]),
    [loading, setLoading] = useState(false),
    [creating, setCreating] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0),
    alive = useRef(true),
    creatingRef = useRef(false),
    input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      sequence.current += 1
    }
  }, [])
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const result = await tagsApi.tagCatalog(recordId)
      if (alive.current && request === sequence.current) setCatalog(result)
    } catch (cause) {
      if (alive.current && request === sequence.current) setError(errorMessage(cause))
    } finally {
      if (alive.current && request === sequence.current) setLoading(false)
    }
  }, [recordId])
  useEffect(() => {
    if (open) {
      setSearch('')
      setView('all')
      void load()
    }
    return () => {
      sequence.current += 1
    }
  }, [open, load])
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  const name = search.trim().normalize('NFC'),
    selected = new Set(tags.map((tag) => tag.id))
  const rows = catalog.filter(
    (tag) =>
      (view === 'all' || selected.has(tag.id)) &&
      tag.name.normalize('NFC').toLocaleLowerCase().includes(name.toLocaleLowerCase()),
  )
  const canCreate = Boolean(name) && !catalog.some((tag) => tag.name.normalize('NFC') === name)
  const create = async () => {
    if (disabled || creatingRef.current || loading || error || tags.length >= 50 || !canCreate)
      return
    creatingRef.current = true
    setCreating(true)
    onBusy(true)
    setError('')
    try {
      const tag = await tagsApi.tag(name)
      if (!alive.current) return
      if (!selected.has(tag.id)) onChange([...tags, tag])
      setSearch('')
      await load()
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause))
    } finally {
      creatingRef.current = false
      if (alive.current) setCreating(false)
      onBusy(false)
    }
  }
  return (
    <Dialog
      open={open && !disabled}
      onOpenChange={(value) => {
        if (!creatingRef.current && !disabled) setOpen(value)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="管理标签" disabled={disabled}>
          <TagIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          input.current?.focus()
        }}
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[min(30rem,calc(100dvh-3rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>管理标签</DialogTitle>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3"
            aria-label="关闭管理标签"
            disabled={creating}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </DialogClose>
        <Tabs value={view} onValueChange={setView} className="min-h-0 flex-1 gap-0">
          <div className="shrink-0 border-b px-4 pb-1 pt-2">
            <TabsList variant="line">
              <TabsTrigger value="all">所有日记</TabsTrigger>
              <TabsTrigger value="current">当前日记</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={view} className="flex min-h-0 flex-1 flex-col">
            <form
              className="shrink-0 border-b p-3"
              onSubmit={(event) => {
                event.preventDefault()
                void create()
              }}
            >
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  ref={input}
                  aria-label="搜索或创建标签"
                  placeholder="搜索或创建标签"
                  maxLength={64}
                  value={search}
                  disabled={creating}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
              {error ? (
                <div role="alert" className="flex flex-col gap-2 py-3 text-sm text-destructive">
                  {error}
                  <Button
                    variant="outline"
                    disabled={creating || loading}
                    onClick={() => void load()}
                  >
                    重新读取标签
                  </Button>
                </div>
              ) : loading ? (
                <p role="status" className="py-3 text-sm text-muted-foreground">
                  正在读取标签…
                </p>
              ) : (
                <>
                  {rows.map((tag) => {
                    const checked = selected.has(tag.id),
                      count = tag.count - Number(tag.current) + Number(checked)
                    return (
                      <label
                        key={tag.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-3 hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          aria-label={`选择标签 ${tag.name}`}
                          checked={checked}
                          disabled={disabled || creating || (!checked && tags.length >= 50)}
                          onChange={(event) => {
                            if (disabled || creatingRef.current) return
                            onChange(
                              event.target.checked
                                ? [...tags, { id: tag.id, name: tag.name }]
                                : tags.filter((item) => item.id !== tag.id),
                            )
                            if (view === 'current' && !event.target.checked) input.current?.focus()
                          }}
                        />
                        <span className="min-w-0 flex-1 break-words text-sm">{tag.name}</span>
                        <span
                          aria-label={`${count} 篇日记`}
                          className="text-xs tabular-nums text-muted-foreground"
                        >
                          {count}
                        </span>
                      </label>
                    )
                  })}
                  {!rows.length && !canCreate && (
                    <p className="py-3 text-sm text-muted-foreground">
                      {name ? '无匹配标签' : view === 'current' ? '当前日记暂无标签' : '暂无标签'}
                    </p>
                  )}
                  {canCreate && (
                    <Button
                      variant="ghost"
                      className="my-1 w-full justify-start"
                      disabled={creating || tags.length >= 50}
                      onClick={() => void create()}
                    >
                      <PlusIcon aria-hidden="true" />
                      创建“{name}”
                    </Button>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
