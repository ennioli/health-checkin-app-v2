import type { DayRecord, Item, ItemVersion } from '../types'
import { addDays, dayOfWeek } from './dates'
import { resolveDay, summarize, type DaySummary } from './judge'
import { versionInForce } from './versions'

/** Monday of the week containing `dateKey`. v1's summary runs Mon–Sun. */
export function weekStart(dateKey: string): string {
  const offset = (dayOfWeek(dateKey) + 6) % 7 // Mon → 0 ... Sun → 6
  return addDays(dateKey, -offset)
}

/** The seven dates of the week containing `dateKey`, Monday first. */
export function weekDates(dateKey: string): string[] {
  const start = weekStart(dateKey)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Dates in this week the user switched the feast-day toggle on. */
export function feastDates(
  feastItemId: string | null,
  recordsByKey: Map<string, DayRecord>,
  dates: string[],
): Set<string> {
  const out = new Set<string>()
  if (!feastItemId) return out
  for (const date of dates) {
    const rec = recordsByKey.get(`${date}|${feastItemId}`)
    if (rec?.value === true) out.add(date)
  }
  return out
}

/**
 * Mon–Sun total for a counter item. Feast days are recorded as usual but
 * excluded from the contract count — that is the whole point of the toggle.
 */
export function weekCounterTotal(
  itemId: string,
  recordsByKey: Map<string, DayRecord>,
  dates: string[],
  exempt: Set<string>,
): number {
  let total = 0
  for (const date of dates) {
    if (exempt.has(date)) continue
    const rec = recordsByKey.get(`${date}|${itemId}`)
    if (rec && typeof rec.value === 'number' && Number.isFinite(rec.value)) total += rec.value
  }
  return total
}

export interface WeekItemCell {
  date: string
  outcome: ReturnType<typeof resolveDay> | null // null = item did not exist yet
}

export interface WeekItemRow {
  item: Item
  cells: WeekItemCell[]
}

/**
 * One item × seven days, each day judged by the version in force *that* day —
 * the week view must never repaint history with today's standard.
 */
export function weekRows(
  items: Item[],
  versionsByItem: Map<string, ItemVersion[]>,
  recordsByKey: Map<string, DayRecord>,
  dates: string[],
  todayKey: string,
): WeekItemRow[] {
  return items.map((item) => {
    const versions = versionsByItem.get(item.id) ?? []
    const cells: WeekItemCell[] = dates.map((date) => {
      const version = versionInForce(versions, date)
      if (!version) return { date, outcome: null }
      const record = recordsByKey.get(`${date}|${item.id}`) ?? null
      return {
        date,
        outcome: resolveDay(item, version, record, date, { dayIsOver: date < todayKey }),
      }
    })
    return { item, cells }
  })
}

/** Aggregate achieved/missed/unfilled over the week's elapsed days. */
export function weekSummary(rows: WeekItemRow[], todayKey: string): DaySummary {
  const outcomes = rows.flatMap((row) =>
    row.cells
      .filter((c) => c.outcome !== null && c.date <= todayKey)
      .map((c) => c.outcome!),
  )
  return summarize(outcomes)
}
