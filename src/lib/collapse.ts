import type { Category } from '../types'

/**
 * Which half of the day the check-in screen is being opened in.
 *
 * The morning fill happens right after waking (08:1x in the record) and the
 * rest of the day's entries — counters, training, the evening reading — land
 * from lunchtime onwards. 04:00 rather than midnight is the boundary because a
 * check-in at 00:30 still belongs to the night that is ending, not the morning.
 */
export type Bucket = 'morning' | 'rest'

export function bucketAt(now: Date): Bucket {
  const h = now.getHours()
  return h >= 4 && h < 12 ? 'morning' : 'rest'
}

/**
 * Categories that start collapsed in each half of the day (owner 2026-09-02).
 * In the morning 飲食 and 健身 have not happened yet; after noon 睡眠 is
 * already filled and will not be touched again. Everything else stays open —
 * 血壓 and 減重 are morning fields the evening still returns to, and 心境 is
 * filled late.
 */
export const AUTO_COLLAPSED: Record<Bucket, Category[]> = {
  morning: ['diet', 'fitness'],
  rest: ['sleep'],
}

export interface CollapseState {
  date: string
  bucket: Bucket
  /** Only the categories the user has explicitly opened or closed. */
  overrides: Partial<Record<Category, boolean>>
}

export function defaultCollapsed(category: Category, bucket: Bucket): boolean {
  return AUTO_COLLAPSED[bucket].includes(category)
}

export function isCollapsed(state: CollapseState, category: Category): boolean {
  return state.overrides[category] ?? defaultCollapsed(category, state.bucket)
}

export function toggle(state: CollapseState, category: Category): CollapseState {
  return {
    ...state,
    overrides: { ...state.overrides, [category]: !isCollapsed(state, category) },
  }
}

/**
 * A remembered override belongs to the day and the half-day that set it.
 * Opening 飲食 at breakfast should not keep 飲食 open every morning forever,
 * and it must not survive into the afternoon where the automatic answer is the
 * opposite — so crossing either boundary drops the overrides and the automatic
 * layout comes back.
 */
export function freshen(
  state: CollapseState | null,
  date: string,
  bucket: Bucket,
): CollapseState {
  if (state && state.date === date && state.bucket === bucket) return state
  return { date, bucket, overrides: {} }
}

const KEY = 'checkin-collapse-v1'

/**
 * Card layout is a per-device preference, not data: it lives in localStorage
 * rather than in Settings so it never enters a backup and never lands on
 * another device through a restore. Storage can throw (private mode, blocked
 * site data), and a lost preference is not worth a crash.
 */
export function loadCollapse(): CollapseState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as CollapseState).date !== 'string'
    ) {
      return null
    }
    const s = parsed as CollapseState
    return {
      date: s.date,
      bucket: s.bucket === 'morning' ? 'morning' : 'rest',
      overrides: typeof s.overrides === 'object' && s.overrides !== null ? s.overrides : {},
    }
  } catch {
    return null
  }
}

export function saveCollapse(state: CollapseState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* preference lost, screen still works */
  }
}
