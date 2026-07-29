import type { TimeAnchor } from '../types'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Local-calendar date string. Never derived from toISOString(), which is UTC. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(now: Date = new Date()): string {
  return toDateKey(now)
}

export function isValidDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function isValidTime(s: unknown): s is string {
  return typeof s === 'string' && TIME_RE.test(s)
}

export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey)
  d.setDate(d.getDate() + delta)
  return toDateKey(d)
}

/** 0 = Sunday. */
export function dayOfWeek(dateKey: string): number {
  return parseDateKey(dateKey).getDay()
}

export function daysBetween(from: string, to: string): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Map 'HH:MM' onto a linear scale so ordinary comparisons work.
 *
 * midnight anchor: 00:00 → 0 ... 23:59 → 1439 (wake times)
 * noon anchor:     12:00 → 0 ... 23:59 → 719, 00:00 → 720 ... 11:59 → 1439
 *                  so a later bedtime is always a larger number, even past
 *                  midnight (23:30 → 690 < 00:30 → 750).
 */
export function timeToMinutes(value: string, anchor: TimeAnchor = 'midnight'): number {
  const [h, m] = value.split(':').map(Number)
  const raw = h * 60 + m
  return anchor === 'noon' ? (raw + 1440 - 720) % 1440 : raw
}

export function minutesToTime(mins: number, anchor: TimeAnchor = 'midnight'): string {
  const raw = anchor === 'noon' ? (mins + 720) % 1440 : ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(raw / 60)).padStart(2, '0')}:${String(raw % 60).padStart(2, '0')}`
}

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayLabel(dateKey: string): string {
  return `週${WEEKDAY_LABEL[dayOfWeek(dateKey)]}`
}

export function formatDateHuman(dateKey: string): string {
  const [, m, d] = dateKey.split('-')
  return `${Number(m)}/${Number(d)} ${weekdayLabel(dateKey)}`
}
