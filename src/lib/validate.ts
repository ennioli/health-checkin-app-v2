import {
  BACKUP_SCHEMA_VERSION,
  BADGES,
  BADGE_ORDER,
  CATEGORIES,
  DATA_TYPES,
  type Badge,
  type BackupFile,
  type Band,
  type Category,
  type DataType,
  type ItemVersion,
  type Scoring,
} from '../types'
import { isValidDateKey, isValidTime } from './dates'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  backup: BackupFile | null
}

const SCORINGS: Scoring[] = ['tiered', 'recorded', 'observe', 'none']

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isIsoDateTime(v: unknown): boolean {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

function isBound(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') return isValidTime(v) || Number.isFinite(Number(v))
  return false
}

function validateBands(bands: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(bands)) {
    errors.push(`${path}: bands 必須是陣列`)
    return
  }
  for (const [i, raw] of bands.entries()) {
    if (!isPlainObject(raw)) {
      errors.push(`${path}.bands[${i}]: 不是物件`)
      continue
    }
    const band = raw as unknown as Band
    // A band may only award an earned badge; ⊘ is what you get when nothing
    // matched, never something a band hands out.
    if (!(BADGE_ORDER as readonly string[]).includes(band.badge)) {
      errors.push(`${path}.bands[${i}]: badge 無效（${String(band.badge)}）`)
    }
    if (band.min === undefined && band.max === undefined) {
      errors.push(`${path}.bands[${i}]: 至少要有 min 或 max`)
    }
    if (band.min !== undefined && !isBound(band.min)) {
      errors.push(`${path}.bands[${i}]: min 型態錯誤`)
    }
    if (band.max !== undefined && !isBound(band.max)) {
      errors.push(`${path}.bands[${i}]: max 型態錯誤`)
    }
  }
}

function validateVersion(raw: unknown, path: string, errors: string[]): ItemVersion | null {
  if (!isPlainObject(raw)) {
    errors.push(`${path}: 不是物件`)
    return null
  }
  const v = raw as unknown as ItemVersion
  if (typeof v.id !== 'string' || !v.id) errors.push(`${path}.id: 缺少或型態錯誤`)
  if (typeof v.itemId !== 'string' || !v.itemId) errors.push(`${path}.itemId: 缺少或型態錯誤`)
  if (!isValidDateKey(v.effectiveFrom)) errors.push(`${path}.effectiveFrom: 不是有效日期`)
  if (typeof v.enabled !== 'boolean') errors.push(`${path}.enabled: 必須是布林`)
  if (typeof v.required !== 'boolean') errors.push(`${path}.required: 必須是布林`)
  if (
    !Array.isArray(v.applicableDays) ||
    v.applicableDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  ) {
    errors.push(`${path}.applicableDays: 必須是 0–6 的整數陣列`)
  }
  if (!SCORINGS.includes(v.scoring)) errors.push(`${path}.scoring: 無效（${String(v.scoring)}）`)
  if (v.bands !== undefined) validateBands(v.bands, path, errors)
  if (v.anchor !== undefined && v.anchor !== 'noon' && v.anchor !== 'midnight') {
    errors.push(`${path}.anchor: 無效`)
  }
  if (v.choiceMap !== undefined) {
    if (!isPlainObject(v.choiceMap)) {
      errors.push(`${path}.choiceMap: 必須是物件`)
    } else {
      for (const [k, badge] of Object.entries(v.choiceMap)) {
        if (!(BADGES as readonly string[]).includes(badge as Badge)) {
          errors.push(`${path}.choiceMap.${k}: badge 無效`)
        }
      }
    }
  }
  if (v.weeklyCap !== undefined && (!Number.isInteger(v.weeklyCap) || v.weeklyCap < 0)) {
    errors.push(`${path}.weeklyCap: 必須是非負整數`)
  }
  if (!isIsoDateTime(v.createdAt)) errors.push(`${path}.createdAt: 不是有效時間`)
  return v
}

/**
 * Validate a parsed backup payload in full, before anything touches the
 * database. Every problem found is reported, and any problem at all fails the
 * whole file — there is no partial import, so existing data is never left
 * half-replaced by a payload that turned out to be broken.
 */
export function validateBackup(parsed: unknown): ValidationResult {
  const errors: string[] = []

  if (!isPlainObject(parsed)) {
    return { ok: false, errors: ['根結構必須是 JSON 物件'], backup: null }
  }

  const b = parsed as unknown as BackupFile

  if (b.schema_version !== BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `不支援的 schema_version：${String(b.schema_version)}（本版只接受 ${BACKUP_SCHEMA_VERSION}）`,
      ],
      backup: null,
    }
  }
  if (!isIsoDateTime(b.exported_at)) errors.push('exported_at: 不是有效的 ISO 時間')
  if (typeof b.app_version !== 'string') errors.push('app_version: 缺少或型態錯誤')
  if (!Array.isArray(b.definitions)) errors.push('definitions: 必須是陣列')
  if (!isPlainObject(b.settings)) errors.push('settings: 必須是物件')
  if (!isPlainObject(b.records)) errors.push('records: 必須是物件')

  if (errors.length > 0) return { ok: false, errors, backup: null }

  // --- definitions -------------------------------------------------------
  const itemIds = new Set<string>()
  const versionIds = new Set<string>()
  const versionsByItem = new Map<string, ItemVersion[]>()

  for (const [i, def] of b.definitions.entries()) {
    const path = `definitions[${i}]`
    if (!isPlainObject(def) || !isPlainObject(def.item)) {
      errors.push(`${path}: 缺少 item 物件`)
      continue
    }
    const item = def.item
    if (typeof item.id !== 'string' || !item.id) {
      errors.push(`${path}.item.id: 缺少或型態錯誤`)
      continue
    }
    if (itemIds.has(item.id)) errors.push(`${path}.item.id: 重複的項目 id（${item.id}）`)
    itemIds.add(item.id)

    if (typeof item.name !== 'string' || !item.name) errors.push(`${path}.item.name: 缺少`)
    if (!(CATEGORIES as readonly string[]).includes(item.category as Category)) {
      errors.push(`${path}.item.category: 無效（${String(item.category)}）`)
    }
    if (!(DATA_TYPES as readonly string[]).includes(item.dataType as DataType)) {
      errors.push(`${path}.item.dataType: 無效（${String(item.dataType)}）`)
    }

    if (!Array.isArray(def.versions) || def.versions.length === 0) {
      errors.push(`${path}.versions: 必須是非空陣列`)
      continue
    }
    const list: ItemVersion[] = []
    for (const [j, rawVersion] of def.versions.entries()) {
      const v = validateVersion(rawVersion, `${path}.versions[${j}]`, errors)
      if (!v) continue
      if (versionIds.has(v.id)) errors.push(`${path}.versions[${j}].id: 重複的版次 id（${v.id}）`)
      versionIds.add(v.id)
      if (v.itemId !== item.id) {
        errors.push(`${path}.versions[${j}].itemId: 與所屬項目不符`)
      }
      list.push(v)
    }
    versionsByItem.set(item.id, list)
  }

  // --- records -----------------------------------------------------------
  for (const [date, dayRaw] of Object.entries(b.records)) {
    if (!isValidDateKey(date)) {
      errors.push(`records["${date}"]: 不是有效日期`)
      continue
    }
    if (!isPlainObject(dayRaw)) {
      errors.push(`records["${date}"]: 必須是物件`)
      continue
    }
    for (const [itemId, recRaw] of Object.entries(dayRaw)) {
      const path = `records["${date}"]["${itemId}"]`
      if (!isPlainObject(recRaw)) {
        errors.push(`${path}: 不是物件`)
        continue
      }
      const rec = recRaw as Record<string, unknown>
      if (rec.date !== date) errors.push(`${path}.date: 與所在日期不符`)
      if (rec.itemId !== itemId) errors.push(`${path}.itemId: 與所在鍵不符`)
      if (typeof rec.key !== 'string' || rec.key !== `${date}|${itemId}`) {
        errors.push(`${path}.key: 應為 "${date}|${itemId}"`)
      }
      if (typeof rec.notApplicable !== 'boolean') errors.push(`${path}.notApplicable: 必須是布林`)
      const value = rec.value
      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        errors.push(`${path}.value: 型態錯誤`)
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        errors.push(`${path}.value: 數值無效`)
      }
      if (!isIsoDateTime(rec.filledAt)) errors.push(`${path}.filledAt: 不是有效時間`)
      if (!isIsoDateTime(rec.updatedAt)) errors.push(`${path}.updatedAt: 不是有效時間`)

      // Referential integrity: the item must exist...
      if (!itemIds.has(itemId)) {
        errors.push(`${path}: 找不到對應的項目定義`)
        continue
      }
      // ...and a version must actually cover this date, otherwise the record
      // could never be judged and the history would be silently unreadable.
      const versions = versionsByItem.get(itemId) ?? []
      const covered = versions.some((v) => v.effectiveFrom <= date)
      if (!covered) {
        errors.push(`${path}: 沒有任何版次涵蓋此日期（最早生效日晚於 ${date}）`)
      }
      if (typeof rec.versionId === 'string' && rec.versionId && !versionIds.has(rec.versionId)) {
        errors.push(`${path}.versionId: 找不到對應版次（${rec.versionId}）`)
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors, backup: null }
  return { ok: true, errors: [], backup: b }
}

/** Parse then validate. Malformed JSON is rejected the same way bad data is. */
export function parseAndValidate(text: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return {
      ok: false,
      errors: [`JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`],
      backup: null,
    }
  }
  return validateBackup(parsed)
}
