import type { ItemVersion } from '../types'

/**
 * The version in force on `dateKey`: the latest one whose effective date is on
 * or before that day. Editing a standard appends a new version with a future
 * (or today's) effective date, so past days keep resolving to the version that
 * was actually in force when they happened — no historical row is ever
 * rewritten. Every judgment in the app goes through this function.
 */
export function versionInForce(versions: ItemVersion[], dateKey: string): ItemVersion | null {
  let best: ItemVersion | null = null
  for (const v of versions) {
    if (v.effectiveFrom > dateKey) continue
    if (!best || v.effectiveFrom > best.effectiveFrom) {
      best = v
    } else if (v.effectiveFrom === best.effectiveFrom && v.createdAt > best.createdAt) {
      // Two edits on the same effective date: the later edit wins.
      best = v
    }
  }
  return best
}

export function sortVersions(versions: ItemVersion[]): ItemVersion[] {
  return [...versions].sort((a, b) =>
    a.effectiveFrom === b.effectiveFrom
      ? a.createdAt.localeCompare(b.createdAt)
      : a.effectiveFrom.localeCompare(b.effectiveFrom),
  )
}

export function groupVersionsByItem(versions: ItemVersion[]): Map<string, ItemVersion[]> {
  const map = new Map<string, ItemVersion[]>()
  for (const v of versions) {
    const list = map.get(v.itemId)
    if (list) list.push(v)
    else map.set(v.itemId, [v])
  }
  for (const [k, list] of map) map.set(k, sortVersions(list))
  return map
}

/** The earliest date any version of this item covers. */
export function earliestEffectiveFrom(versions: ItemVersion[]): string | null {
  let min: string | null = null
  for (const v of versions) if (!min || v.effectiveFrom < min) min = v.effectiveFrom
  return min
}
