import { expect, it } from 'vitest'
import { blankDateCondition, resolveDateCondition, shortcutDate } from './dateConditions'
const now = new Date('2026-10-23T12:00:00')
it('converts strict and inclusive date comparisons without moving the selected date', () => {
  const base = { ...blankDateCondition, start: '2026-10-23' }
  expect(resolveDateCondition({ ...base, operator: 'is' })).toEqual({
    dateFrom: '2026-10-23',
    dateTo: '2026-10-23',
  })
  expect(resolveDateCondition({ ...base, operator: 'before' })).toEqual({
    dateFrom: null,
    dateTo: '2026-10-22',
  })
  expect(resolveDateCondition({ ...base, operator: 'after' })).toEqual({
    dateFrom: '2026-10-24',
    dateTo: null,
  })
  expect(resolveDateCondition({ ...base, operator: 'onOrBefore' })).toEqual({
    dateFrom: null,
    dateTo: '2026-10-23',
  })
  expect(resolveDateCondition({ ...base, operator: 'onOrAfter' })).toEqual({
    dateFrom: '2026-10-23',
    dateTo: null,
  })
  expect(resolveDateCondition({ ...base, operator: 'between', end: '2026-11-02' })).toEqual({
    dateFrom: '2026-10-23',
    dateTo: '2026-11-02',
  })
})
it('resolves natural periods and rolling past and future ranges across year boundaries', () => {
  const base = { ...blankDateCondition, operator: 'relative' as const }
  expect(resolveDateCondition(base, now)).toEqual({ dateFrom: '2026-10-19', dateTo: '2026-10-25' })
  expect(resolveDateCondition({ ...base, direction: 'past' }, now)).toEqual({
    dateFrom: '2026-10-16',
    dateTo: '2026-10-22',
  })
  expect(resolveDateCondition({ ...base, direction: 'future' }, now)).toEqual({
    dateFrom: '2026-10-24',
    dateTo: '2026-10-30',
  })
  expect(resolveDateCondition({ ...base, unit: 'month' }, now)).toEqual({
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
  })
  expect(resolveDateCondition({ ...base, unit: 'year' }, now)).toEqual({
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
  })
  expect(resolveDateCondition(base, new Date('2026-01-01T12:00:00'))).toEqual({
    dateFrom: '2025-12-29',
    dateTo: '2026-01-04',
  })
})
it('clamps month and year shortcuts at leap days and reevaluates dynamic dates', () => {
  expect(shortcutDate('monthBefore', new Date('2024-03-31T12:00:00'))).toBe('2024-02-29')
  expect(shortcutDate('monthAfter', new Date('2026-01-31T12:00:00'))).toBe('2026-02-28')
  expect(resolveDateCondition({ ...blankDateCondition, shortcut: 'today' }, now).dateFrom).toBe(
    '2026-10-23',
  )
  expect(
    resolveDateCondition(
      { ...blankDateCondition, shortcut: 'today' },
      new Date('2026-10-24T12:00:00'),
    ).dateFrom,
  ).toBe('2026-10-24')
})
it('rejects unsupported generic fields and empty checks at the diary adapter boundary', () => {
  expect(() =>
    resolveDateCondition({ ...blankDateCondition, field: 'end', start: '2026-10-23' }),
  ).toThrow('记录日期')
  expect(() => resolveDateCondition({ ...blankDateCondition, operator: 'isEmpty' })).toThrow(
    '记录日期',
  )
})
