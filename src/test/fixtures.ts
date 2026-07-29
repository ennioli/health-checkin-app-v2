import type { DayRecord, Item, ItemVersion } from '../types'
import { ALL_DAYS } from '../lib/presets'

let counter = 0
export function id(prefix = 'id'): string {
  counter++
  return `${prefix}-${counter}`
}

export function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: id('item'),
    category: 'sleep',
    name: '上床時間',
    dataType: 'time',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function makeVersion(itemId: string, over: Partial<ItemVersion> = {}): ItemVersion {
  return {
    id: id('ver'),
    itemId,
    effectiveFrom: '2026-01-01',
    enabled: true,
    required: true,
    applicableDays: ALL_DAYS,
    scoring: 'tiered',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function makeRecord(
  itemId: string,
  date: string,
  value: DayRecord['value'],
  over: Partial<DayRecord> = {},
): DayRecord {
  return {
    key: `${date}|${itemId}`,
    date,
    itemId,
    value,
    notApplicable: false,
    versionId: '',
    filledAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
    ...over,
  }
}
