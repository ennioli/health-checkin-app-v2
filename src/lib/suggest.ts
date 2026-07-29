import type { Band, DayRecord, Item, ItemVersion } from '../types'
import { addDays, isValidTime, minutesToTime, timeToMinutes } from './dates'
import { appliesOnDay, resolveDay } from './judge'
import { versionInForce } from './versions'

export const LOOKBACK_APPLICABLE_DAYS = 7
export const STRUGGLE_THRESHOLD = 3

export interface Struggle {
  item: Item
  version: ItemVersion
  /** How many of the recent applicable days were missed or left unfilled. */
  badDays: number
  consideredDays: number
}

/**
 * Spot items the user is repeatedly failing, so the app can offer to make them
 * easier instead of just showing another ❌.
 *
 * Looks back over the last N *applicable* days ending yesterday — today is
 * excluded because an unfilled today is not yet a failure. Days the user
 * marked not-applicable are skipped entirely rather than counted as misses.
 */
export function findStruggles(
  items: Item[],
  versionsByItem: Map<string, ItemVersion[]>,
  recordsByKey: Map<string, DayRecord>,
  todayKey: string,
  snoozedUntil: Record<string, string> = {},
): Struggle[] {
  const out: Struggle[] = []

  for (const item of items) {
    const versions = versionsByItem.get(item.id) ?? []
    const current = versionInForce(versions, todayKey)
    if (!current || !current.enabled || current.scoring === 'none') continue
    if (snoozedUntil[item.id] && snoozedUntil[item.id] >= todayKey) continue

    let considered = 0
    let bad = 0
    // Walk back day by day; stop once enough applicable days are collected or
    // we run out of a sensible window (8 weeks) to look through.
    for (let back = 1; back <= 56 && considered < LOOKBACK_APPLICABLE_DAYS; back++) {
      const date = addDays(todayKey, -back)
      const version = versionInForce(versions, date)
      if (!version || !version.enabled) continue
      if (!appliesOnDay(version, date)) continue

      const record = recordsByKey.get(`${date}|${item.id}`) ?? null
      if (record?.notApplicable) continue

      considered++
      const outcome = resolveDay(item, version, record, date, { dayIsOver: true })
      const isBad =
        outcome.achieved === false || (outcome.status === 'unfilled' && version.required)
      if (isBad) bad++
    }

    if (considered > 0 && bad >= STRUGGLE_THRESHOLD) {
      out.push({ item, version: current, badDays: bad, consideredDays: considered })
    }
  }

  return out
}

/**
 * Propose a gentler version of the same standard — one notch, not a collapse.
 * This is only ever shown as a suggestion; nothing is saved until the user
 * confirms it.
 */
export function proposeEasierBands(version: ItemVersion): Band[] | null {
  if (!version.bands || version.bands.length === 0) return null
  const direction = version.direction ?? 'atLeast'

  const easeNumber = (n: number, kind: 'min' | 'max'): number => {
    if (direction === 'atLeast') return kind === 'min' ? round(n * 0.8) : n
    if (direction === 'atMost') return kind === 'max' ? round(n * 1.2) : n
    // range: widen both ends
    return kind === 'min' ? round(n * 0.95) : round(n * 1.05)
  }

  const easeBound = (
    bound: number | string | undefined,
    kind: 'min' | 'max',
  ): number | string | undefined => {
    if (bound === undefined) return undefined
    if (typeof bound === 'string' && isValidTime(bound)) {
      const anchor = version.anchor ?? 'midnight'
      const mins = timeToMinutes(bound, anchor)
      // Later bedtime / later wake-up is the easier direction for a deadline.
      const eased = kind === 'max' ? mins + 30 : mins - 30
      return minutesToTime(eased, anchor)
    }
    const n = typeof bound === 'number' ? bound : Number(bound)
    if (!Number.isFinite(n)) return bound
    return easeNumber(n, kind)
  }

  return version.bands.map((band) => ({
    badge: band.badge,
    ...(band.min !== undefined ? { min: easeBound(band.min, 'min') } : {}),
    ...(band.max !== undefined ? { max: easeBound(band.max, 'max') } : {}),
  }))
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
