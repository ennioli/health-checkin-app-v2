import { openDB, type IDBPDatabase } from 'idb'
import type { DayRecord, Item, ItemVersion, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

export const DB_NAME = 'health-checkin-v2'
export const DB_VERSION = 1

export const STORES = ['items', 'itemVersions', 'records', 'meta'] as const
export type StoreName = (typeof STORES)[number]

export interface Snapshot {
  items: Item[]
  versions: ItemVersion[]
  records: DayRecord[]
  settings: Settings
}

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('itemVersions')) {
          const s = db.createObjectStore('itemVersions', { keyPath: 'id' })
          s.createIndex('byItem', 'itemId')
        }
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'key' })
          s.createIndex('byDate', 'date')
          s.createIndex('byItem', 'itemId')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
    })
  }
  return dbPromise
}

/**
 * Test hook: close the live connection and drop the cached handle so a fresh
 * database can be opened. Without the close, `deleteDatabase` blocks forever
 * on the still-open connection.
 */
export async function resetDBHandle(): Promise<void> {
  if (dbPromise) {
    try {
      ;(await dbPromise).close()
    } catch {
      // Never opened successfully — nothing to close.
    }
  }
  dbPromise = null
}

export async function loadSnapshot(): Promise<Snapshot> {
  const db = await getDB()
  const [items, versions, records, settings] = await Promise.all([
    db.getAll('items') as Promise<Item[]>,
    db.getAll('itemVersions') as Promise<ItemVersion[]>,
    db.getAll('records') as Promise<DayRecord[]>,
    db.get('meta', 'settings') as Promise<Settings | undefined>,
  ])
  return { items, versions, records, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } }
}

export async function putItem(item: Item): Promise<void> {
  const db = await getDB()
  await db.put('items', item)
}

export async function putVersion(version: ItemVersion): Promise<void> {
  const db = await getDB()
  await db.put('itemVersions', version)
}

export async function putItemWithVersion(item: Item, version: ItemVersion): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['items', 'itemVersions'], 'readwrite')
  await Promise.all([
    tx.objectStore('items').put(item),
    tx.objectStore('itemVersions').put(version),
    tx.done,
  ])
}

/**
 * Create several items at once, in a single transaction. First-run setup used
 * to write them one by one, which briefly rendered a half-built plan and left
 * a window where a crash could strand a partial setup.
 */
export async function putItemsWithVersions(
  pairs: Array<{ item: Item; version: ItemVersion }>,
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['items', 'itemVersions'], 'readwrite')
  const items = tx.objectStore('items')
  const versions = tx.objectStore('itemVersions')
  for (const { item, version } of pairs) {
    await items.put(item)
    await versions.put(version)
  }
  await tx.done
}

export async function putRecord(record: DayRecord): Promise<void> {
  const db = await getDB()
  await db.put('records', record)
}

export async function deleteRecord(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('records', key)
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB()
  await db.put('meta', settings, 'settings')
}

export async function deleteItemCascade(itemId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['items', 'itemVersions', 'records'], 'readwrite')
  const versions = tx.objectStore('itemVersions')
  const records = tx.objectStore('records')
  const versionKeys = await versions.index('byItem').getAllKeys(itemId)
  const recordKeys = await records.index('byItem').getAllKeys(itemId)
  await Promise.all([
    tx.objectStore('items').delete(itemId),
    ...versionKeys.map((k) => versions.delete(k)),
    ...recordKeys.map((k) => records.delete(k)),
    tx.done,
  ])
}

/**
 * Replace every store's contents with `next`, atomically.
 *
 * One readwrite transaction spans all stores, so a failure anywhere — a bad
 * write, a thrown validation error, a browser crash mid-way — aborts the whole
 * thing and leaves the previous data exactly as it was. There is deliberately
 * no "clear now, write later" gap where the database is empty.
 *
 * `injectFailure` exists so tests can prove that guarantee rather than assume
 * it; production callers never pass it.
 */
export async function replaceAll(
  next: Snapshot,
  injectFailure?: 'before-write' | 'mid-write',
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['items', 'itemVersions', 'records', 'meta'], 'readwrite')
  const items = tx.objectStore('items')
  const versions = tx.objectStore('itemVersions')
  const records = tx.objectStore('records')
  const meta = tx.objectStore('meta')

  // Aborting rejects tx.done. Claim that rejection up front so an intentional
  // abort never surfaces as an unhandled rejection; the real error still
  // propagates from the throw below.
  const done = tx.done
  done.catch(() => {})

  try {
    await Promise.all([items.clear(), versions.clear(), records.clear(), meta.clear()])

    if (injectFailure === 'before-write') throw new Error('injected failure before write')

    for (const item of next.items) await items.put(item)
    for (const v of next.versions) await versions.put(v)

    let written = 0
    for (const r of next.records) {
      if (injectFailure === 'mid-write' && written === Math.floor(next.records.length / 2)) {
        throw new Error('injected failure mid write')
      }
      await records.put(r)
      written++
    }
    await meta.put(next.settings, 'settings')
    await done
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // Already aborted or already committed — nothing further to undo.
    }
    throw err
  }
}
