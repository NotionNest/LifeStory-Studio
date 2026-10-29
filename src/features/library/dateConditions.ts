import { resolveDateConstraint, type DateCondition } from '@/components/date-filter/dateConditions'
export {
  blankDateCondition,
  dateConditionLabel,
  shortcutDate,
  type DateCondition,
} from '@/components/date-filter/dateConditions'
export const diaryDateCapabilities = {
  fields: [{ value: 'start' as const, label: '记录日期' }],
  operators: ['is', 'before', 'after', 'onOrBefore', 'onOrAfter', 'between', 'relative'] as const,
}
export function resolveDateCondition(condition: DateCondition | null, now = new Date()) {
  if (
    condition &&
    (condition.field !== 'start' ||
      condition.operator === 'isEmpty' ||
      condition.operator === 'isNotEmpty')
  )
    throw new Error('日记筛选只支持必填的记录日期')
  const { dateFrom, dateTo } = resolveDateConstraint(condition, now)
  return { dateFrom, dateTo }
}
