import type { BackupDefinition, BackupFile, DayRecord, Settings } from '../types'
import { BACKUP_SCHEMA_VERSION } from '../types'
import { daysBetween } from './dates'
import type { Snapshot } from './db'
import { groupVersionsByItem } from './versions'

export const APP_VERSION = '0.1.0'

export function buildBackup(snapshot: Snapshot, exportedAt: string): BackupFile {
  const byItem = groupVersionsByItem(snapshot.versions)
  const definitions: BackupDefinition[] = snapshot.items.map((item) => ({
    item,
    versions: byItem.get(item.id) ?? [],
  }))

  const records: Record<string, Record<string, DayRecord>> = {}
  for (const r of snapshot.records) {
    ;(records[r.date] ??= {})[r.itemId] = r
  }

  return {
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: exportedAt,
    app_version: APP_VERSION,
    definitions,
    settings: snapshot.settings,
    records,
  }
}

export function backupToSnapshot(backup: BackupFile): Snapshot {
  return {
    items: backup.definitions.map((d) => d.item),
    versions: backup.definitions.flatMap((d) => d.versions),
    records: Object.values(backup.records).flatMap((byItem) => Object.values(byItem)),
    settings: backup.settings as Settings,
  }
}

export function backupFilename(dateKey: string, prefix = 'health-checkin-backup'): string {
  return `${prefix}-${dateKey}.json`
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

export interface BackupStats {
  dayCount: number
  recordCount: number
  itemCount: number
  firstDate: string | null
  lastDate: string | null
  exportedAt: string | null
}

export function statsFromBackup(backup: BackupFile): BackupStats {
  const dates = Object.keys(backup.records).sort()
  let recordCount = 0
  for (const day of Object.values(backup.records)) recordCount += Object.keys(day).length
  return {
    dayCount: dates.length,
    recordCount,
    itemCount: backup.definitions.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    exportedAt: backup.exported_at,
  }
}

export function statsFromSnapshot(snapshot: Snapshot): BackupStats {
  const dates = [...new Set(snapshot.records.map((r) => r.date))].sort()
  return {
    dayCount: dates.length,
    recordCount: snapshot.records.length,
    itemCount: snapshot.items.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    exportedAt: null,
  }
}

/**
 * Whether to show the "you have not backed up in a while" nudge.
 *
 * With no backup ever taken, the clock runs from the oldest record rather than
 * from now — nagging someone on the day they start, before there is anything
 * worth losing, is exactly the kind of friction that gets an app deleted.
 */
export function backupReminderDue(
  lastBackupAt: string | null,
  recordDates: string[],
  todayKey: string,
  thresholdDays = 7,
): boolean {
  if (recordDates.length === 0) return false
  const since = lastBackupAt ? lastBackupAt.slice(0, 10) : [...recordDates].sort()[0]
  return daysBetween(since, todayKey) >= thresholdDays
}

/** Trigger a file download in the browser. Not used in tests. */
export function downloadJSON(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give Safari a moment to start the download before the blob disappears.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
