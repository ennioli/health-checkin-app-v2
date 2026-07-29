import { beforeEach, describe, expect, it } from 'vitest'
import {
  DB_NAME,
  loadSnapshot,
  putItemWithVersion,
  putRecord,
  putVersion,
  replaceAll,
  resetDBHandle,
  saveSettings,
  type Snapshot,
} from './db'
import { backupToSnapshot, buildBackup, serializeBackup } from './backup'
import { parseAndValidate } from './validate'
import { makeItem, makeRecord, makeVersion } from '../test/fixtures'
import { DEFAULT_SETTINGS } from '../types'

async function freshDB() {
  await resetDBHandle()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

function sampleSnapshot(): Snapshot {
  const water = makeItem({ dataType: 'number', name: '飲水量', category: 'diet' })
  const bed = makeItem({ dataType: 'time', name: '上床時間', category: 'sleep' })
  const wv1 = makeVersion(water.id, {
    effectiveFrom: '2026-01-01',
    bands: [{ badge: 'gold', min: 1500 }],
  })
  const wv2 = makeVersion(water.id, {
    effectiveFrom: '2026-03-01',
    bands: [{ badge: 'gold', min: 2200 }],
  })
  const bv = makeVersion(bed.id, {
    effectiveFrom: '2026-01-01',
    anchor: 'noon',
    direction: 'atMost',
    bands: [{ badge: 'gold', max: '23:30' }],
  })
  return {
    items: [water, bed],
    versions: [wv1, wv2, bv],
    records: [
      makeRecord(water.id, '2026-02-10', 1800, { versionId: wv1.id }),
      makeRecord(water.id, '2026-03-10', 2400, { versionId: wv2.id }),
      makeRecord(bed.id, '2026-03-10', '23:10', { versionId: bv.id }),
      makeRecord(bed.id, '2026-03-11', null, { versionId: bv.id, notApplicable: true }),
    ],
    settings: { ...DEFAULT_SETTINGS, lastBackupAt: '2026-03-11T08:00:00.000Z' },
  }
}

async function seed(snapshot: Snapshot) {
  for (const item of snapshot.items) {
    const first = snapshot.versions.find((v) => v.itemId === item.id)!
    await putItemWithVersion(item, first)
  }
  for (const v of snapshot.versions) await putVersion(v)
  for (const r of snapshot.records) await putRecord(r)
  await saveSettings(snapshot.settings)
}

describe('backup round trip', () => {
  beforeEach(async () => {
    await freshDB()
  })

  it('reproduces definitions, threshold versions, settings and records exactly', async () => {
    const original = sampleSnapshot()
    await seed(original)

    const before = await loadSnapshot()
    const json = serializeBackup(buildBackup(before, '2026-03-12T00:00:00.000Z'))

    // Wipe and restore from the serialized file, the way the UI does.
    const parsed = parseAndValidate(json)
    expect(parsed.errors).toEqual([])
    expect(parsed.ok).toBe(true)

    await replaceAll(backupToSnapshot(parsed.backup!))
    const after = await loadSnapshot()

    const sortById = <T extends { id: string }>(xs: T[]) =>
      [...xs].sort((a, b) => a.id.localeCompare(b.id))
    const sortByKey = <T extends { key: string }>(xs: T[]) =>
      [...xs].sort((a, b) => a.key.localeCompare(b.key))

    expect(sortById(after.items)).toEqual(sortById(before.items))
    expect(sortById(after.versions)).toEqual(sortById(before.versions))
    expect(sortByKey(after.records)).toEqual(sortByKey(before.records))
    expect(after.settings).toEqual(before.settings)
  })

  it('keeps a not-applicable day distinguishable after the round trip', async () => {
    await seed(sampleSnapshot())
    const before = await loadSnapshot()
    const json = serializeBackup(buildBackup(before, '2026-03-12T00:00:00.000Z'))
    await replaceAll(backupToSnapshot(parseAndValidate(json).backup!))
    const after = await loadSnapshot()
    const na = after.records.find((r) => r.notApplicable)
    expect(na).toBeDefined()
    expect(na!.value).toBeNull()
  })
})

describe('replaceAll is atomic', () => {
  beforeEach(async () => {
    await freshDB()
  })

  it('leaves existing data untouched when the write fails before any put', async () => {
    const original = sampleSnapshot()
    await seed(original)
    const before = await loadSnapshot()

    const incoming: Snapshot = {
      items: [],
      versions: [],
      records: [],
      settings: { ...DEFAULT_SETTINGS },
    }
    await expect(replaceAll(incoming, 'before-write')).rejects.toThrow(/injected failure/)

    const after = await loadSnapshot()
    expect(after.items.length).toBe(before.items.length)
    expect(after.versions.length).toBe(before.versions.length)
    expect(after.records.length).toBe(before.records.length)
    expect(after.settings).toEqual(before.settings)
  })

  it('leaves existing data untouched when the write fails halfway through', async () => {
    const original = sampleSnapshot()
    await seed(original)
    const before = await loadSnapshot()

    const incoming = sampleSnapshot()
    await expect(replaceAll(incoming, 'mid-write')).rejects.toThrow(/injected failure/)

    const after = await loadSnapshot()
    expect(after.records.length).toBe(before.records.length)
    expect(after.items.length).toBe(before.items.length)
    // Not a single record from the incoming payload leaked in.
    const beforeKeys = new Set(before.records.map((r) => r.key))
    for (const r of after.records) expect(beforeKeys.has(r.key)).toBe(true)
  })

  it('actually replaces everything on the happy path', async () => {
    await seed(sampleSnapshot())
    const replacement = sampleSnapshot()
    await replaceAll(replacement)
    const after = await loadSnapshot()
    expect(after.items.map((i) => i.id).sort()).toEqual(
      replacement.items.map((i) => i.id).sort(),
    )
    expect(after.records.length).toBe(replacement.records.length)
  })
})
