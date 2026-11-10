import { SearchHighlight } from '@/components/SearchHighlight'
import { searchApi, type SearchItem, type QueryPage } from '@/services/search'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, CalendarDays, List, PenLine, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateFilter } from './DateFilter'
import { TagFilter } from './TagFilter'
import { TimelineImages } from './TimelineImages'
import { errorMessage } from '@/lib/errors'
import { localDate } from '@/lib/localDate'
import { type useLibraryQuery, type Filters, emptyFilters, calendarDates } from './useLibraryQuery'
const itemTitle = (item: SearchItem) => item.title || item.excerpt.split('\n')[0] || '无标题记录'
function DayEntries({
  date,
  filters,
  working,
  onOpen,
  onCreate,
}: {
  date: string
  filters: Filters
  working: boolean
  onOpen: (item: SearchItem) => void
  onCreate: (date?: string) => void
}) {
  const [page, setPage] = useState<QueryPage | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const sequence = useRef(0)
  const load = useCallback(
    async (offset = 0) => {
      const request = ++sequence.current
      setLoading(true)
      setError('')
      try {
        const from = filters.dateFrom && filters.dateFrom > date ? filters.dateFrom : date,
          to = filters.dateTo && filters.dateTo < date ? filters.dateTo : date
        const next =
          from > to
            ? { items: [], total: 0, nextOffset: null, days: [], tags: [], months: [] }
            : await searchApi.query({ ...filters, dateFrom: from, dateTo: to, month: null, offset })
        if (request === sequence.current)
          setPage((old) => ({
            ...next,
            items: offset
              ? [
                  ...(old?.items ?? []),
                  ...next.items.filter(
                    (item) => !old?.items.some((previous) => previous.id === item.id),
                  ),
                ]
              : next.items,
          }))
      } catch (cause) {
        if (request === sequence.current) setError(errorMessage(cause))
      } finally {
        if (request === sequence.current) setLoading(false)
      }
    },
    [date, filters],
  )
  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`day-${date}`} className="font-medium">
          {date}
        </h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`在 ${date} 新建日记`}
          disabled={working}
          onClick={() => onCreate(date)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto" aria-busy={loading}>
        {page?.items.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className="h-auto min-h-8 justify-start whitespace-normal text-left"
            disabled={working || loading}
            onClick={() => onOpen(item)}
          >
            {item.mood && (
              <span role="img" aria-label={`心情 ${item.mood}`}>
                {item.mood}
              </span>
            )}
            {itemTitle(item)}
          </Button>
        ))}
        {loading && (
          <p role="status" className="p-2 text-sm text-muted-foreground">
            正在查询…
          </p>
        )}
        {!loading && !error && page?.items.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">暂无记录</p>
        )}
        {error && (
          <div role="alert" className="p-2 text-sm text-destructive">
            {error}
            <Button size="sm" variant="ghost" onClick={() => void load(page?.nextOffset ?? 0)}>
              重试查询
            </Button>
          </div>
        )}
        {page?.nextOffset != null && !error && (
          <Button
            variant="ghost"
            disabled={loading || working}
            onClick={() => void load(page.nextOffset!)}
          >
            加载更多
          </Button>
        )}
      </div>
    </>
  )
}
export function LibraryBrowser({
  browser,
  active = true,
  working,
  onOpen,
  onCreate,
  positions: storedPositions,
  titlebarTarget,
}: {
  browser: ReturnType<typeof useLibraryQuery>
  active?: boolean
  titlebarTarget?: HTMLElement | null
  working: boolean
  onOpen: (item: SearchItem) => void
  onCreate: (date?: string) => void
  positions?: {
    current: Record<
      string,
      { top: number; left: number; id?: string; index?: number; offset?: number }
    >
  }
}) {
  const {
    filters,
    change: applyFilters,
    page,
    calendar,
    loading,
    error,
    refresh,
    view,
    setView,
    month,
    setMonth,
  } = browser
  const [day, setDay] = useState<string | null>(null)
  const [activeMonth, setActiveMonth] = useState('')
  const viewport = useRef<HTMLDivElement>(null),
    restore = useRef(true)
  const localPositions = useRef<
    Record<string, { top: number; left: number; id?: string; index?: number; offset?: number }>
  >({})
  const positions = storedPositions ?? localPositions
  const change = (next: Filters) => {
    positions.current = {}
    if (viewport.current) {
      viewport.current.scrollTop = 0
      viewport.current.scrollLeft = 0
    }
    applyFilters(next)
  }
  const remember = useCallback(
    (id?: string) => {
      const element = viewport.current
      if (!element) return
      const buttons = [...element.querySelectorAll<HTMLElement>('[data-record-id]')]
      const target =
        buttons.find((button) => button.dataset.recordId === id) ??
        buttons.find((button) => button === document.activeElement) ??
        buttons.find(
          (button) => button.getBoundingClientRect().bottom > element.getBoundingClientRect().top,
        )
      positions.current[view] = {
        top: element.scrollTop,
        left: element.scrollLeft,
        id: target?.dataset.recordId,
        index: target ? buttons.indexOf(target) : undefined,
        offset: target
          ? target.getBoundingClientRect().top - element.getBoundingClientRect().top
          : undefined,
      }
    },
    [positions, view],
  )
  useLayoutEffect(() => {
    if (!active) {
      restore.current = true
      return
    }
    if (loading) {
      restore.current = true
      return
    }
    if (!restore.current) return
    const element = viewport.current,
      position = positions.current[view]
    if (element && position) {
      element.scrollTop = position.top
      element.scrollLeft = position.left
      if (position.id === undefined && position.index === undefined) {
        restore.current = false
        return
      }
      const buttons = [...element.querySelectorAll<HTMLElement>('[data-record-id]')]
      const target =
        buttons.find((button) => button.dataset.recordId === position.id) ??
        buttons[Math.min(position.index ?? 0, buttons.length - 1)]
      if (target) {
        element.scrollTop +=
          target.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          (position.offset ?? 0)
        target.focus({ preventScroll: true })
      } else element.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    }
    restore.current = false
  }, [active, loading, view, page, calendar, positions])
  useEffect(() => {
    setDay(null)
  }, [filters, month, view, active])
  useEffect(() => {
    setActiveMonth('')
  }, [filters])
  useLayoutEffect(() => () => remember(), [remember])
  const open = (item: SearchItem) => {
    remember(day ? `day:${day}` : item.id)
    setDay(null)
    onOpen(item)
  }
  const create = (date?: string) => {
    remember()
    setDay(null)
    onCreate(date)
  }
  const changeView = (value: string) => {
    if (value !== 'timeline' && value !== 'calendar') return
    remember()
    restore.current = true
    setView(value)
  }
  const dates = calendarDates(month),
    today = localDate(),
    tags = view === 'calendar' ? calendar.tags : page.tags
  const changeMonth = (amount: number) => {
    const date = new Date(`${month}-01T12:00:00`)
    date.setMonth(date.getMonth() + amount)
    setMonth(localDate(date).slice(0, 7))
    viewport.current?.scrollTo?.({ top: 0 })
    positions.current.calendar = { top: 0, left: 0 }
  }
  const filtered = Boolean(
    filters.keyword ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.kinds.length ||
    filters.tagIds.length,
  )
  const toolbar = (
    <div className="flex w-max items-center gap-1 px-0.5" aria-label="日记首页操作">
      <TabsList className="bg-transparent">
        <TabsTrigger
          value="timeline"
          className="px-3 hover:bg-sidebar-hover data-[state=active]:!bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:!shadow-none data-[state=active]:hover:!bg-sidebar-accent-hover"
        >
          <List aria-hidden="true" />
          列表
        </TabsTrigger>
        <TabsTrigger
          value="calendar"
          className="px-3 hover:bg-sidebar-hover data-[state=active]:!bg-sidebar-accent data-[state=active]:text-sidebar-accent-foreground data-[state=active]:!shadow-none data-[state=active]:hover:!bg-sidebar-accent-hover"
        >
          <CalendarDays aria-hidden="true" />
          日历
        </TabsTrigger>
      </TabsList>
      <span aria-hidden="true" className="mx-2 h-5 w-px bg-[var(--workspace-border)]" />
      <DateFilter
        condition={browser.dateCondition}
        active={active}
        onChange={(condition) => {
          positions.current = {}
          browser.setDateCondition(condition)
        }}
      />
      <TagFilter filters={filters} tags={tags} active={active} onChange={change} />
      {filtered && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            browser.setDateCondition(null)
            change(emptyFilters)
          }}
        >
          清除全部筛选
        </Button>
      )}
      <span aria-hidden="true" className="mx-2 h-5 w-px bg-[var(--workspace-border)]" />
      <Button
        size="sm"
        className="bg-foreground text-background hover:bg-foreground/85"
        disabled={working}
        onClick={() => create()}
      >
        <PenLine data-icon="inline-start" aria-hidden="true" />
        新建日记
      </Button>
    </div>
  )
  return (
    <Tabs value={view} onValueChange={changeView} className="h-full min-h-0 gap-0">
      <h1 className="sr-only">日记</h1>
      {titlebarTarget === undefined ? (
        <div className="overflow-x-auto border-b px-6 py-2">{toolbar}</div>
      ) : (
        titlebarTarget && createPortal(toolbar, titlebarTarget)
      )}
      {view === 'calendar' && (
        <header className="diary-calendar-header shrink-0 px-6 lg:px-8">
          {view === 'calendar' && (
            <div className="flex items-center justify-between gap-3">
              <input
                type="month"
                aria-label="日历月份"
                value={month}
                className="diary-calendar-month"
                onChange={(event) => {
                  if (event.target.value) setMonth(event.target.value)
                }}
              />
              <div className="diary-calendar-controls flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="上个月"
                  onClick={() => changeMonth(-1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMonth(today.slice(0, 7))}>
                  今天
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="下个月"
                  onClick={() => changeMonth(1)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </header>
      )}
      <div
        ref={viewport}
        onScroll={() => {
          remember()
          if (view === 'timeline' && viewport.current) {
            const top = viewport.current.getBoundingClientRect().top
            const rows = [...viewport.current.querySelectorAll<HTMLElement>('[data-month]')]
            const row = rows.find((item) => item.getBoundingClientRect().bottom > top + 12)
            if (row?.dataset.month) setActiveMonth(row.dataset.month)
          }
        }}
        className="diary-browser-scroll min-h-0 flex-1 overflow-auto px-6 pb-8 lg:px-8"
        aria-busy={loading}
      >
        {error && (
          <div role="alert" className="flex items-center gap-2 py-4 text-sm text-destructive">
            {error}
            <Button size="sm" variant="ghost" onClick={() => void refresh()}>
              重试查询
            </Button>
          </div>
        )}
        {loading && (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            正在查询记录…
          </p>
        )}
        <TabsContent value="timeline" forceMount hidden={view !== 'timeline'} className="mt-0">
          {page.months.length > 0 &&
            (() => {
              const currentMonth = page.months.some((entry) => entry.month === activeMonth)
                ? activeMonth
                : (page.items[0]?.recordDate.slice(0, 7) ?? page.months[0].month)
              const year = currentMonth.slice(0, 4)
              const years = [...new Set(page.months.map((entry) => entry.month.slice(0, 4)))]
              const yearIndex = years.indexOf(year)
              const jump = (value: string) => {
                remember()
                const previousPosition = positions.current.timeline
                positions.current.timeline = { top: 0, left: 0 }
                void browser.jumpToMonth(value).then((success) => {
                  if (!success) {
                    if (previousPosition) positions.current.timeline = previousPosition
                    return
                  }
                  setActiveMonth(value)
                  if (viewport.current) viewport.current.scrollTop = 0
                  positions.current.timeline = { top: 0, left: 0 }
                })
              }
              return (
                <div className="diary-timeline-navigation">
                  <div className="flex items-center gap-2">
                    <h2 className="diary-timeline-year">{year} 年</h2>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="较新的年份"
                      disabled={yearIndex <= 0 || loading}
                      onClick={() =>
                        jump(
                          page.months.find((entry) => entry.month.startsWith(years[yearIndex - 1]))!
                            .month,
                        )
                      }
                    >
                      <ChevronLeft aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="较早的年份"
                      disabled={yearIndex >= years.length - 1 || loading}
                      onClick={() =>
                        jump(
                          page.months.find((entry) => entry.month.startsWith(years[yearIndex + 1]))!
                            .month,
                        )
                      }
                    >
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                  <nav aria-label="记录月份" className="diary-timeline-months">
                    {page.months
                      .filter((entry) => entry.month.startsWith(year))
                      .map((entry) => (
                        <Button
                          key={entry.month}
                          size="sm"
                          variant="ghost"
                          aria-current={entry.month === currentMonth ? 'date' : undefined}
                          disabled={loading}
                          onClick={() => jump(entry.month)}
                        >
                          {Number(entry.month.slice(5))}月
                        </Button>
                      ))}
                  </nav>
                </div>
              )
            })()}
          {browser.hasPrevious && (
            <Button
              variant="ghost"
              disabled={loading || working}
              onClick={() => {
                remember()
                restore.current = true
                void browser.loadPrevious()
              }}
            >
              加载较新记录
            </Button>
          )}
          <div className="diary-timeline">
            {page.items.map((item, index) => {
              const date = item.recordDate
              const month = date.slice(0, 7)
              const newMonth = index === 0 || page.items[index - 1].recordDate.slice(0, 7) !== month
              const newDate = index === 0 || page.items[index - 1].recordDate !== date
              const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(
                new Date(`${date}T12:00:00`),
              )
              return (
                <article
                  key={item.id}
                  data-month={month}
                  className={`diary-timeline-entry${newDate ? ' diary-timeline-entry-new-day' : ''}`}
                >
                  {newMonth && (
                    <div className="diary-timeline-month-label">{Number(date.slice(5, 7))}月</div>
                  )}
                  <div className="diary-timeline-row">
                    <div className="diary-timeline-date">
                      {newDate && (
                        <>
                          <span>{weekday}</span>
                          <span
                            className={`diary-timeline-day diary-timeline-day-${(Number(date.slice(5, 7)) % 3) + 1}`}
                          >
                            {Number(date.slice(8, 10))}
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      className="diary-timeline-content"
                      onClick={(event) => {
                        if (
                          !working &&
                          !loading &&
                          !(event.target as HTMLElement).closest('button')
                        )
                          open(item)
                      }}
                    >
                      <div className="diary-timeline-heading">
                        <button
                          data-record-id={item.id}
                          disabled={working || loading}
                          className="diary-timeline-title"
                          onClick={() => open(item)}
                        >
                          <SearchHighlight text={itemTitle(item)} keyword={filters.keyword} />
                        </button>
                        <span className="diary-timeline-time">
                          创建于{' '}
                          {new Date(item.createdAt).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {item.title && item.excerpt && (
                        <p className="diary-timeline-excerpt">
                          <SearchHighlight text={item.excerpt} keyword={filters.keyword} />
                        </p>
                      )}
                      {(item.tags.length > 0 || item.mood) && (
                        <div className="diary-timeline-tags">
                          {item.tags.map((tag) => (
                            <Badge variant="secondary" key={tag.id}>
                              {tag.name}
                            </Badge>
                          ))}
                          {item.mood && (
                            <span role="img" aria-label={`心情 ${item.mood}`}>
                              {item.mood}
                            </span>
                          )}
                        </div>
                      )}
                      <TimelineImages recordId={item.id} ids={item.imageIds} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {!loading && !error && page.items.length === 0 && (
            <p role="status" className="py-8 text-sm text-muted-foreground">
              {filtered ? '没有符合条件的记录。' : '暂无记录'}
            </p>
          )}
          {page.nextOffset !== null && !error && (
            <Button
              className="mt-4"
              variant="ghost"
              disabled={working || loading}
              onClick={() => void refresh(page.nextOffset!)}
            >
              加载更多
            </Button>
          )}
        </TabsContent>
        <TabsContent
          value="calendar"
          forceMount
          hidden={view !== 'calendar'}
          className="mt-0 min-w-[700px]"
        >
          <section aria-label="记录日历" className="grid grid-cols-7">
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label) => (
              <div
                key={label}
                className="diary-calendar-weekday sticky top-0 bg-background py-3 text-center text-xs text-muted-foreground"
              >
                {label}
              </div>
            ))}
            {dates.map((date) => {
              const result = calendar.days.find((value) => value.date === date)
              return (
                <div
                  key={date}
                  className={`diary-calendar-day group/day flex min-w-0 flex-col gap-1 border-b border-r border-border/70 p-2 [&:nth-child(7n+1)]:border-l ${date.slice(0, 7) !== month ? 'diary-calendar-day-outside' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <Popover
                      open={active && day === date}
                      onOpenChange={(value) => setDay(value ? date : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant={
                            date === today ? 'default' : day === date ? 'secondary' : 'ghost'
                          }
                          data-record-id={`day:${date}`}
                          aria-label={`查看 ${date} 的记录`}
                          className="rounded-full"
                          aria-current={date === today ? 'date' : undefined}
                        >
                          {Number(date.slice(-2))}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-80 max-w-[calc(100vw-2rem)]"
                        aria-labelledby={`day-${date}`}
                        onCloseAutoFocus={(event) => {
                          if (!active) event.preventDefault()
                        }}
                      >
                        <DayEntries
                          date={date}
                          filters={filters}
                          working={working}
                          onOpen={open}
                          onCreate={create}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`在 ${date} 新建日记`}
                      disabled={working}
                      className="opacity-0 group-hover/day:opacity-100 group-focus-within/day:opacity-100 focus-visible:opacity-100"
                      onClick={() => create(date)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                  {!loading &&
                    !error &&
                    result?.items.map((item) => (
                      <Button
                        key={item.id}
                        data-record-id={item.id}
                        size="sm"
                        variant="ghost"
                        className="diary-calendar-entry w-full justify-start"
                        disabled={working}
                        onClick={() => open(item)}
                      >
                        {item.mood && (
                          <span className="shrink-0" role="img" aria-label={`心情 ${item.mood}`}>
                            {item.mood}
                          </span>
                        )}
                        <span className="truncate">
                          <SearchHighlight text={itemTitle(item)} keyword={filters.keyword} />
                        </span>
                      </Button>
                    ))}
                  {!loading && !error && result && result.count > 3 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="justify-start"
                      onClick={() => setDay(date)}
                    >
                      还有 {result.count - 3} 篇
                    </Button>
                  )}
                </div>
              )
            })}
          </section>
        </TabsContent>
      </div>
    </Tabs>
  )
}
