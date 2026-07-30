import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Band,
  Category,
  DataType,
  DayRecord,
  Item,
  ItemVersion,
  RecordValue,
  Scoring,
  Settings,
  TimeAnchor,
} from './types'
import {
  deleteItemCascade,
  deleteRecord,
  loadSnapshot,
  putDefinitions,
  putItemWithVersion,
  putItemsWithVersions,
  putRecord,
  putVersion,
  replaceAll,
  saveSettings,
  type Snapshot,
} from './lib/db'
import { presetDrift } from './lib/reconcile'
import { groupVersionsByItem } from './lib/versions'
import { ALL_DAYS, PRESETS, type Preset } from './lib/presets'
import { CATEGORIES } from './types'

// IndexedDB returns items in UUID order — meaningless to a human. Present
// them in category order, then preset definition order, then creation time.
const PRESET_INDEX = new Map(PRESETS.map((p, i) => [p.key, i]))
function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const cat = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)
    if (cat !== 0) return cat
    const ai = a.presetKey ? (PRESET_INDEX.get(a.presetKey) ?? 999) : 999
    const bi = b.presetKey ? (PRESET_INDEX.get(b.presetKey) ?? 999) : 999
    if (ai !== bi) return ai - bi
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function newId(): string {
  return crypto.randomUUID()
}

export interface Store {
  loading: boolean
  snapshot: Snapshot
  versionsByItem: Map<string, ItemVersion[]>
  recordsByKey: Map<string, DayRecord>
  reload: () => Promise<void>
  setValue: (itemId: string, date: string, value: RecordValue) => Promise<void>
  setNotApplicable: (itemId: string, date: string, flag: boolean) => Promise<void>
  addPresetItem: (preset: Preset, effectiveFrom: string) => Promise<Item>
  addPresetItems: (presets: Preset[], effectiveFrom: string) => Promise<void>
  addCustomItem: (input: CustomItemInput, effectiveFrom: string) => Promise<Item>
  appendVersion: (
    itemId: string,
    patch: Partial<Omit<ItemVersion, 'id' | 'itemId' | 'createdAt'>>,
    effectiveFrom: string,
  ) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  applyRestore: (next: Snapshot) => Promise<void>
}

export interface CustomItemInput {
  category: Category
  name: string
  dataType: DataType
  unit?: string
  scoring: Scoring
  direction?: 'atLeast' | 'atMost' | 'range'
  bands?: Band[]
  anchor?: TimeAnchor
  choices?: string[]
  choiceMap?: ItemVersion['choiceMap']
  required: boolean
  applicableDays: number[]
}

const EMPTY: Snapshot = {
  items: [],
  versions: [],
  records: [],
  settings: { lastBackupAt: null, suggestionSnoozedUntil: {}, onboarded: false },
}

export function useStore(): Store {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    let next = await loadSnapshot()
    // An install created before a preset changed shape still holds the old
    // definition. Re-point it here, once, before anything renders — otherwise
    // the phone keeps the retired control forever while a fresh install shows
    // the new one. A no-op on every load after the first.
    const drift = presetDrift(next.items, next.versions)
    if (drift.items.length > 0 || drift.versions.length > 0) {
      await putDefinitions(drift.items, drift.versions)
      next = await loadSnapshot()
    }
    setSnapshot({ ...next, items: sortItems(next.items) })
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const versionsByItem = useMemo(() => groupVersionsByItem(snapshot.versions), [snapshot.versions])
  const recordsByKey = useMemo(() => {
    const m = new Map<string, DayRecord>()
    for (const r of snapshot.records) m.set(r.key, r)
    return m
  }, [snapshot.records])

  const writeRecord = useCallback(
    async (itemId: string, date: string, mutate: (prev: DayRecord | null) => DayRecord | null) => {
      const key = `${date}|${itemId}`
      const prev = snapshot.records.find((r) => r.key === key) ?? null
      const next = mutate(prev)
      if (next === null) {
        await deleteRecord(key)
      } else {
        await putRecord(next)
      }
      await reload()
    },
    [snapshot.records, reload],
  )

  const currentVersionId = useCallback(
    (itemId: string, date: string): string => {
      const versions = versionsByItem.get(itemId) ?? []
      let best: ItemVersion | null = null
      for (const v of versions) {
        if (v.effectiveFrom > date) continue
        if (!best || v.effectiveFrom > best.effectiveFrom) best = v
      }
      return best?.id ?? ''
    },
    [versionsByItem],
  )

  const setValue = useCallback(
    async (itemId: string, date: string, value: RecordValue) => {
      const now = new Date().toISOString()
      await writeRecord(itemId, date, (prev) => {
        // Clearing a field with nothing else recorded removes the row entirely,
        // so the day reads as genuinely unfilled rather than filled-with-null.
        if ((value === null || value === '') && !prev?.notApplicable) return null
        return {
          key: `${date}|${itemId}`,
          date,
          itemId,
          value,
          notApplicable: prev?.notApplicable ?? false,
          versionId: currentVersionId(itemId, date),
          filledAt: prev?.filledAt ?? now,
          updatedAt: now,
        }
      })
    },
    [writeRecord, currentVersionId],
  )

  const setNotApplicable = useCallback(
    async (itemId: string, date: string, flag: boolean) => {
      const now = new Date().toISOString()
      await writeRecord(itemId, date, (prev) => {
        if (!flag && (prev?.value === null || prev?.value === undefined)) return null
        return {
          key: `${date}|${itemId}`,
          date,
          itemId,
          value: flag ? null : (prev?.value ?? null),
          notApplicable: flag,
          versionId: currentVersionId(itemId, date),
          filledAt: prev?.filledAt ?? now,
          updatedAt: now,
        }
      })
    },
    [writeRecord, currentVersionId],
  )

  const addPresetItem = useCallback(
    async (preset: Preset, effectiveFrom: string) => {
      const now = new Date().toISOString()
      const item: Item = {
        id: newId(),
        category: preset.category,
        name: preset.name,
        dataType: preset.dataType,
        unit: preset.unit,
        createdAt: now,
        presetKey: preset.key,
      }
      const version: ItemVersion = {
        id: newId(),
        itemId: item.id,
        effectiveFrom,
        enabled: true,
        required: preset.required ?? preset.scoring !== 'none',
        applicableDays: preset.applicableDays ?? ALL_DAYS,
        scoring: preset.scoring,
        direction: preset.direction,
        anchor: preset.anchor,
        choiceMap: preset.choiceMap,
        choices: preset.choices,
        weeklyCap: preset.weeklyCap,
        createdAt: now,
      }
      await putItemWithVersion(item, version)
      await reload()
      return item
    },
    [reload],
  )

  /** First-run setup: everything the user picked lands in one write. */
  const addPresetItems = useCallback(
    async (presets: Preset[], effectiveFrom: string) => {
      const now = new Date().toISOString()
      const pairs = presets.map((preset) => {
        const item: Item = {
          id: newId(),
          category: preset.category,
          name: preset.name,
          dataType: preset.dataType,
          unit: preset.unit,
          createdAt: now,
          presetKey: preset.key,
        }
        const version: ItemVersion = {
          id: newId(),
          itemId: item.id,
          effectiveFrom,
          enabled: true,
          required: preset.required ?? preset.scoring !== 'none',
          applicableDays: preset.applicableDays ?? ALL_DAYS,
          scoring: preset.scoring,
          direction: preset.direction,
          anchor: preset.anchor,
          choiceMap: preset.choiceMap,
          choices: preset.choices,
          weeklyCap: preset.weeklyCap,
          createdAt: now,
        }
        return { item, version }
      })
      await putItemsWithVersions(pairs)
      await reload()
    },
    [reload],
  )

  const addCustomItem = useCallback(
    async (input: CustomItemInput, effectiveFrom: string) => {
      const now = new Date().toISOString()
      const item: Item = {
        id: newId(),
        category: input.category,
        name: input.name,
        dataType: input.dataType,
        unit: input.unit,
        createdAt: now,
      }
      const version: ItemVersion = {
        id: newId(),
        itemId: item.id,
        effectiveFrom,
        enabled: true,
        required: input.required,
        applicableDays: input.applicableDays,
        scoring: input.scoring,
        direction: input.direction,
        bands: input.bands,
        anchor: input.anchor,
        choices: input.choices,
        choiceMap: input.choiceMap,
        createdAt: now,
      }
      await putItemWithVersion(item, version)
      await reload()
      return item
    },
    [reload],
  )

  /**
   * Every plan change appends a new version stamped with its effective date.
   * Old versions stay untouched, which is what keeps past judgments stable.
   */
  const appendVersion = useCallback(
    async (
      itemId: string,
      patch: Partial<Omit<ItemVersion, 'id' | 'itemId' | 'createdAt'>>,
      effectiveFrom: string,
    ) => {
      const versions = versionsByItem.get(itemId) ?? []
      const base = versions.at(-1)
      if (!base) return
      const next: ItemVersion = {
        ...base,
        ...patch,
        id: newId(),
        itemId,
        effectiveFrom,
        createdAt: new Date().toISOString(),
      }
      await putVersion(next)
      await reload()
    },
    [versionsByItem, reload],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      await deleteItemCascade(itemId)
      await reload()
    },
    [reload],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...snapshot.settings, ...patch }
      await saveSettings(next)
      await reload()
    },
    [snapshot.settings, reload],
  )

  const applyRestore = useCallback(
    async (next: Snapshot) => {
      await replaceAll(next)
      await reload()
    },
    [reload],
  )

  return {
    loading,
    snapshot,
    versionsByItem,
    recordsByKey,
    reload,
    setValue,
    setNotApplicable,
    addPresetItem,
    addPresetItems,
    addCustomItem,
    appendVersion,
    removeItem,
    updateSettings,
    applyRestore,
  }
}
