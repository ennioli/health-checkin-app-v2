import { describe, expect, it } from 'vitest'
import { parseAndValidate, validateBackup } from './validate'
import { backupReminderDue, buildBackup } from './backup'
import { makeItem, makeRecord, makeVersion } from '../test/fixtures'
import type { Snapshot } from './db'
import { DEFAULT_SETTINGS } from '../types'

function goodSnapshot(): Snapshot {
  const item = makeItem({ dataType: 'number', name: '飲水量' })
  const version = makeVersion(item.id, {
    effectiveFrom: '2026-01-01',
    bands: [{ badge: 'gold', min: 2000 }],
  })
  return {
    items: [item],
    versions: [version],
    records: [makeRecord(item.id, '2026-02-01', 2100, { versionId: version.id })],
    settings: { ...DEFAULT_SETTINGS },
  }
}

function goodBackup() {
  return buildBackup(goodSnapshot(), '2026-02-02T00:00:00.000Z')
}

describe('validateBackup — accepts what the app itself produces', () => {
  it('passes a freshly built backup', () => {
    const result = validateBackup(goodBackup())
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })
})

describe('validateBackup — rejects the whole file', () => {
  it('rejects malformed JSON', () => {
    const result = parseAndValidate('{ not json')
    expect(result.ok).toBe(false)
    expect(result.backup).toBeNull()
    expect(result.errors[0]).toContain('JSON 解析失敗')
  })

  it('rejects a non-object root', () => {
    expect(validateBackup([1, 2, 3]).ok).toBe(false)
    expect(validateBackup('nope').ok).toBe(false)
    expect(validateBackup(null).ok).toBe(false)
  })

  it('rejects an unsupported schema version', () => {
    const b = { ...goodBackup(), schema_version: 2 }
    const result = validateBackup(b)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('不支援的 schema_version')
  })

  it('rejects a missing schema version', () => {
    const b: Record<string, unknown> = { ...goodBackup() }
    delete b.schema_version
    expect(validateBackup(b).ok).toBe(false)
  })

  it('rejects wrong field types', () => {
    const b = goodBackup()
    // @ts-expect-error deliberately corrupting the payload
    b.definitions[0].versions[0].enabled = 'yes'
    const result = validateBackup(b)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('enabled')
  })

  it('rejects an invalid date key', () => {
    const b = goodBackup()
    const rec = b.records['2026-02-01']
    delete b.records['2026-02-01']
    b.records['2026-02-31'] = rec
    expect(validateBackup(b).ok).toBe(false)
  })

  it('rejects a record whose item definition is missing', () => {
    const b = goodBackup()
    b.definitions = []
    const result = validateBackup(b)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('找不到對應的項目定義')
  })

  it('rejects a record no version covers', () => {
    const b = goodBackup()
    // Push the only version's effective date past the record's date.
    b.definitions[0].versions[0].effectiveFrom = '2026-05-01'
    const result = validateBackup(b)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('沒有任何版次涵蓋此日期')
  })

  it('rejects an item with no versions at all', () => {
    const b = goodBackup()
    b.definitions[0].versions = []
    expect(validateBackup(b).ok).toBe(false)
  })

  it('rejects duplicate item ids', () => {
    const b = goodBackup()
    b.definitions.push({ ...b.definitions[0] })
    const result = validateBackup(b)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('重複的項目 id')
  })

  it('rejects a record key that disagrees with its position', () => {
    const b = goodBackup()
    b.records['2026-02-01'][Object.keys(b.records['2026-02-01'])[0]].key = 'wrong'
    expect(validateBackup(b).ok).toBe(false)
  })

  it('rejects a band with an unusable bound', () => {
    const b = goodBackup()
    // @ts-expect-error deliberately corrupting the payload
    b.definitions[0].versions[0].bands[0].min = 'not-a-number'
    expect(validateBackup(b).ok).toBe(false)
  })

  it('rejects a non-finite numeric value', () => {
    const b = goodBackup()
    const day = b.records['2026-02-01']
    day[Object.keys(day)[0]].value = Number.NaN
    // NaN does not survive JSON, so validate the parsed-equivalent directly.
    expect(validateBackup(b).ok).toBe(false)
  })

  it('never returns a payload alongside errors', () => {
    const result = validateBackup({ ...goodBackup(), settings: 'nope' })
    expect(result.ok).toBe(false)
    expect(result.backup).toBeNull()
  })
})

describe('backupReminderDue', () => {
  it('stays quiet on the first day of use', () => {
    expect(backupReminderDue(null, ['2026-07-29'], '2026-07-29')).toBe(false)
  })

  it('speaks up once a week of data has piled up unbacked', () => {
    expect(backupReminderDue(null, ['2026-07-22', '2026-07-25'], '2026-07-29')).toBe(true)
  })

  it('counts from the last backup once there is one', () => {
    expect(backupReminderDue('2026-07-27T10:00:00.000Z', ['2026-07-01'], '2026-07-29')).toBe(false)
    expect(backupReminderDue('2026-07-20T10:00:00.000Z', ['2026-07-01'], '2026-07-29')).toBe(true)
  })

  it('says nothing when there is no data to lose', () => {
    expect(backupReminderDue(null, [], '2026-07-29')).toBe(false)
  })
})
