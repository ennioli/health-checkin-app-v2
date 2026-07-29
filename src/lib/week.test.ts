import { describe, expect, it } from 'vitest'
import { feastDates, weekCounterTotal, weekDates, weekRows, weekStart, weekSummary } from './week'
import { makeItem, makeRecord, makeVersion } from '../test/fixtures'
import type { DayRecord, ItemVersion } from '../types'

// 2026-07-27 is a Monday; 2026-08-02 the following Sunday.
const MON = '2026-07-27'
const SUN = '2026-08-02'

describe('weekStart / weekDates — Monday-based, v1 style', () => {
  it('maps every day of the week to the same Monday', () => {
    expect(weekStart('2026-07-27')).toBe(MON) // Monday itself
    expect(weekStart('2026-07-29')).toBe(MON) // Wednesday
    expect(weekStart('2026-08-02')).toBe(MON) // Sunday
  })

  it('rolls to the previous Monday, not the same-week Sunday', () => {
    expect(weekStart('2026-07-26')).toBe('2026-07-20') // a Sunday
  })

  it('produces seven consecutive dates', () => {
    const dates = weekDates('2026-07-29')
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe(MON)
    expect(dates[6]).toBe(SUN)
  })
})

function mapOf(records: DayRecord[]): Map<string, DayRecord> {
  return new Map(records.map((r) => [r.key, r]))
}

describe('weekCounterTotal — the snack contract', () => {
  const snacks = 'item-snacks'
  const dates = weekDates('2026-07-29')

  it('sums the week and excludes feast days', () => {
    const records = mapOf([
      makeRecord(snacks, '2026-07-27', 1),
      makeRecord(snacks, '2026-07-28', 2), // feast day — recorded, not counted
      makeRecord(snacks, '2026-07-30', 1),
    ])
    const exempt = new Set(['2026-07-28'])
    expect(weekCounterTotal(snacks, records, dates, exempt)).toBe(2)
    expect(weekCounterTotal(snacks, records, dates, new Set())).toBe(4)
  })

  it('ignores days outside the week', () => {
    const records = mapOf([makeRecord(snacks, '2026-07-26', 5)]) // previous Sunday
    expect(weekCounterTotal(snacks, records, dates, new Set())).toBe(0)
  })
})

describe('feastDates', () => {
  const feast = 'item-feast'
  const dates = weekDates('2026-07-29')

  it('collects only days the toggle is actually on', () => {
    const records = mapOf([
      makeRecord(feast, '2026-07-28', true),
      makeRecord(feast, '2026-07-30', null), // toggled off again
    ])
    expect([...feastDates(feast, records, dates)]).toEqual(['2026-07-28'])
  })

  it('is empty when the feast item does not exist', () => {
    expect(feastDates(null, mapOf([]), dates).size).toBe(0)
  })
})

describe('weekRows / weekSummary — history stays judged by its own standard', () => {
  it('judges each cell by the version in force that day', () => {
    const item = makeItem({ dataType: 'number', name: '飲水量' })
    const lenient = makeVersion(item.id, {
      effectiveFrom: '2026-07-01',
      bands: [{ badge: 'gold', min: 1000 }],
    })
    const strict = makeVersion(item.id, {
      effectiveFrom: '2026-07-30',
      bands: [{ badge: 'gold', min: 2500 }],
    })
    const versions = new Map<string, ItemVersion[]>([[item.id, [lenient, strict]]])
    const records = mapOf([
      makeRecord(item.id, '2026-07-28', 1500), // lenient era → gold
      makeRecord(item.id, '2026-07-31', 1500), // strict era → miss
    ])
    const rows = weekRows([item], versions, records, weekDates('2026-07-29'), '2026-08-02')
    const byDate = Object.fromEntries(rows[0].cells.map((c) => [c.date, c.outcome]))
    expect(byDate['2026-07-28']!.badge).toBe('gold')
    expect(byDate['2026-07-31']!.badge).toBe('miss')
  })

  it('does not fail days before the item existed, nor future days', () => {
    const item = makeItem({ dataType: 'fiveLevel', name: '晨間伸展' })
    const version = makeVersion(item.id, { effectiveFrom: '2026-07-29' })
    const versions = new Map<string, ItemVersion[]>([[item.id, [version]]])
    const todayKey = '2026-07-30'
    const rows = weekRows([item], versions, mapOf([]), weekDates('2026-07-29'), todayKey)
    const byDate = Object.fromEntries(rows[0].cells.map((c) => [c.date, c.outcome]))

    expect(byDate['2026-07-27']).toBeNull() // before effectiveFrom
    expect(byDate['2026-07-29']!.achieved).toBe(false) // elapsed, unfilled, required
    expect(byDate['2026-07-30']!.achieved).toBeNull() // today, still open
    expect(byDate['2026-07-31']!.achieved).toBeNull() // future

    // The summary only counts elapsed days.
    const summary = weekSummary(rows, todayKey)
    expect(summary.missed).toBe(1)
    expect(summary.achieved).toBe(0)
  })
})
