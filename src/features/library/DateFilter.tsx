import { useEffect, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateFilterContent } from '@/components/date-filter/DateFilterContent'
import { dateConditionLabel, diaryDateCapabilities, type DateCondition } from './dateConditions'

export function DateFilter({
  condition,
  active,
  onChange,
}: {
  condition: DateCondition | null
  active: boolean
  onChange: (condition: DateCondition | null) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!active) setOpen(false)
  }, [active])
  return (
    <Popover open={active && open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={condition ? 'secondary' : 'ghost'}
          aria-label="日期筛选"
          className="max-w-64"
        >
          <CalendarDays aria-hidden="true" />
          <span className="truncate">{dateConditionLabel(condition)}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] p-3"
        aria-label="记录日期筛选"
      >
        <DateFilterContent
          value={condition}
          capabilities={diaryDateCapabilities}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  )
}
