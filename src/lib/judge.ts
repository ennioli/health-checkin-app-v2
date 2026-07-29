import type {
  Badge,
  Band,
  DayOutcome,
  DayRecord,
  Item,
  ItemVersion,
  RecordValue,
} from '../types'
import { BADGE_ORDER } from '../types'
import { dayOfWeek, isValidTime, timeToMinutes } from './dates'

/**
 * Put a value and a band bound on the same numeric scale.
 * Time strings become anchor-relative minutes; everything else is a number.
 */
export function toScalar(value: RecordValue, version: ItemVersion): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null
  if (typeof value === 'string') {
    if (isValidTime(value)) return timeToMinutes(value, version.anchor ?? 'midnight')
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return Number.isFinite(value) ? value : null
}

function boundToScalar(bound: number | string | undefined, version: ItemVersion): number | null {
  if (bound === undefined) return null
  if (typeof bound === 'number') return Number.isFinite(bound) ? bound : null
  if (isValidTime(bound)) return timeToMinutes(bound, version.anchor ?? 'midnight')
  const n = Number(bound)
  return Number.isFinite(n) ? n : null
}

function matchesBand(scalar: number, band: Band, version: ItemVersion): boolean {
  const min = boundToScalar(band.min, version)
  const max = boundToScalar(band.max, version)
  if (min !== null && scalar < min) return false
  if (max !== null && scalar > max) return false
  return true
}

/**
 * Turn one filled value into a badge.
 *
 * All three threshold directions (at-least, at-most, range) reduce to the same
 * thing: an ordered list of bands walked best → worst, first match wins,
 * nothing matched → ⊘. The direction is only a hint for the editor UI.
 *
 * Returns null when the item is not badge-scored (free text, or a plain record
 * with no bands) — the caller decides what "done" means for those.
 */
export function judge(value: RecordValue, version: ItemVersion): Badge | null {
  if (version.scoring === 'none') return null
  if (value === null || value === undefined || value === '') return null

  if (version.scoring === 'recorded') return null
  // 'observe' falls through: it earns a badge like 'tiered', and only the
  // achieved/missed accounting differs (handled in resolveDay).

  // Yes/no and single choice: an explicit answer → badge map, set when the
  // item was created. Anything unmapped is a miss rather than a silent pass.
  // Checked before the direct-badge case so a choice whose label happens to be
  // "gold" still goes through its own map.
  if (version.choiceMap) {
    const key = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value)
    return version.choiceMap[key] ?? 'miss'
  }

  const bands = version.bands
  if (!bands || bands.length === 0) {
    // Five-level pick: no bands, no map — the user chose the badge directly.
    if (typeof value === 'string' && (BADGE_ORDER as string[]).includes(value)) return value as Badge
    if (value === 'miss') return 'miss'
    return null
  }

  const scalar = toScalar(value, version)
  if (scalar === null) return 'miss'

  for (const band of bands) {
    if (matchesBand(scalar, band, version)) return band.badge
  }
  return 'miss'
}

export function isAchieved(badge: Badge | null): boolean | null {
  if (badge === null) return null
  return badge !== 'miss'
}

export function appliesOnDay(version: ItemVersion, dateKey: string): boolean {
  return version.applicableDays.includes(dayOfWeek(dateKey))
}

/**
 * Resolve one item on one day into a single outcome, using the version that
 * was in force that day. This is the only place the four states are decided,
 * so they can never drift apart between the check-in screen and the summary.
 */
export function resolveDay(
  item: Item,
  version: ItemVersion | null,
  record: DayRecord | null,
  dateKey: string,
  opts: { dayIsOver: boolean },
): DayOutcome {
  if (!version || !version.enabled) {
    return { item, version, status: 'disabled', record, badge: null, achieved: null }
  }
  if (!appliesOnDay(version, dateKey)) {
    return { item, version, status: 'notApplicableDay', record, badge: null, achieved: null }
  }
  // Only ever true because the user said so. Never counted as an achievement.
  if (record?.notApplicable) {
    return { item, version, status: 'markedNotApplicable', record, badge: null, achieved: null }
  }

  const hasValue = record != null && record.value !== null && record.value !== ''
  if (!hasValue) {
    // An unfilled day is only a failure once the day is over and the item was
    // actually required. Before that it is simply outstanding. Observe items
    // never fail — they are outside the achieved/missed accounting entirely.
    const failed =
      opts.dayIsOver &&
      version.required &&
      version.scoring !== 'none' &&
      version.scoring !== 'observe'
    return {
      item,
      version,
      status: 'unfilled',
      record,
      badge: null,
      achieved: failed ? false : null,
    }
  }

  const badge = judge(record.value, version)
  if (version.scoring === 'recorded') {
    return { item, version, status: 'filled', record, badge: null, achieved: true }
  }
  if (version.scoring === 'none') {
    return { item, version, status: 'filled', record, badge: null, achieved: null }
  }
  if (version.scoring === 'observe') {
    // The badge is shown for the user's own reference, but the item never
    // moves the day's achieved/missed counts (v1's 核心 semantics).
    return { item, version, status: 'filled', record, badge, achieved: null }
  }
  return { item, version, status: 'filled', record, badge, achieved: isAchieved(badge) }
}

export interface DaySummary {
  achieved: number
  missed: number
  unfilled: number
  notApplicable: number
  /** Items that count toward achieved/missed at all. */
  counted: number
}

export function summarize(outcomes: DayOutcome[]): DaySummary {
  const s: DaySummary = { achieved: 0, missed: 0, unfilled: 0, notApplicable: 0, counted: 0 }
  for (const o of outcomes) {
    if (o.status === 'disabled' || o.status === 'notApplicableDay') continue
    if (o.status === 'markedNotApplicable') {
      s.notApplicable++
      continue
    }
    if (o.status === 'unfilled') {
      s.unfilled++
      if (o.achieved === false) {
        s.missed++
        s.counted++
      }
      continue
    }
    if (o.achieved === true) {
      s.achieved++
      s.counted++
    } else if (o.achieved === false) {
      s.missed++
      s.counted++
    }
  }
  return s
}
