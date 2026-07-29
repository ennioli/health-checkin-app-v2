import { describe, expect, it } from 'vitest'
import { findStruggles, proposeEasierBands } from './suggest'
import { addDays } from './dates'
import { makeItem, makeRecord, makeVersion } from '../test/fixtures'
import type { DayRecord, ItemVersion } from '../types'

const TODAY = '2026-04-20'

function build(values: Array<number | null | 'na'>) {
  const item = makeItem({ dataType: 'number', name: '飲水量', category: 'diet' })
  const version = makeVersion(item.id, {
    effectiveFrom: '2026-01-01',
    bands: [{ badge: 'gold', min: 2000 }],
    direction: 'atLeast',
  })
  const versionsByItem = new Map<string, ItemVersion[]>([[item.id, [version]]])
  const recordsByKey = new Map<string, DayRecord>()
  values.forEach((v, i) => {
    const date = addDays(TODAY, -(i + 1))
    if (v === null) return // left unfilled
    if (v === 'na') {
      recordsByKey.set(
        `${date}|${item.id}`,
        makeRecord(item.id, date, null, { notApplicable: true }),
      )
      return
    }
    recordsByKey.set(`${date}|${item.id}`, makeRecord(item.id, date, v))
  })
  return { item, version, versionsByItem, recordsByKey }
}

describe('findStruggles', () => {
  it('flags an item missed on three of the last seven applicable days', () => {
    const { item, versionsByItem, recordsByKey } = build([500, 500, 500, 2500, 2500, 2500, 2500])
    const out = findStruggles([item], versionsByItem, recordsByKey, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].badDays).toBe(3)
    expect(out[0].consideredDays).toBe(7)
  })

  it('stays quiet at two bad days', () => {
    const { item, versionsByItem, recordsByKey } = build([500, 500, 2500, 2500, 2500, 2500, 2500])
    expect(findStruggles([item], versionsByItem, recordsByKey, TODAY)).toHaveLength(0)
  })

  it('counts unfilled required days as bad', () => {
    const { item, versionsByItem, recordsByKey } = build([null, null, null, 2500, 2500, 2500, 2500])
    expect(findStruggles([item], versionsByItem, recordsByKey, TODAY)[0].badDays).toBe(3)
  })

  it('does not hold not-applicable days against the user', () => {
    const { item, versionsByItem, recordsByKey } = build([
      'na',
      'na',
      'na',
      500,
      500,
      2500,
      2500,
      2500,
      2500,
      2500,
    ])
    expect(findStruggles([item], versionsByItem, recordsByKey, TODAY)).toHaveLength(0)
  })

  it('ignores today, which may simply not be filled in yet', () => {
    const { item, versionsByItem, recordsByKey } = build([2500, 2500, 2500, 2500, 2500, 2500, 2500])
    expect(findStruggles([item], versionsByItem, recordsByKey, TODAY)).toHaveLength(0)
  })

  it('respects a snooze', () => {
    const { item, versionsByItem, recordsByKey } = build([500, 500, 500, 2500, 2500, 2500, 2500])
    const snoozed = { [item.id]: addDays(TODAY, 3) }
    expect(findStruggles([item], versionsByItem, recordsByKey, TODAY, snoozed)).toHaveLength(0)
  })

  it('says nothing about a disabled item', () => {
    const item = makeItem({ dataType: 'number' })
    const version = makeVersion(item.id, {
      enabled: false,
      bands: [{ badge: 'gold', min: 2000 }],
    })
    const out = findStruggles(
      [item],
      new Map([[item.id, [version]]]),
      new Map(),
      TODAY,
    )
    expect(out).toHaveLength(0)
  })
})

describe('proposeEasierBands', () => {
  it('lowers an at-least threshold', () => {
    const v = makeVersion('i', {
      direction: 'atLeast',
      bands: [
        { badge: 'gold', min: 2000 },
        { badge: 'bronze', min: 1000 },
      ],
    })
    expect(proposeEasierBands(v)).toEqual([
      { badge: 'gold', min: 1600 },
      { badge: 'bronze', min: 800 },
    ])
  })

  it('pushes a bedtime deadline later, across midnight if needed', () => {
    const v = makeVersion('i', {
      direction: 'atMost',
      anchor: 'noon',
      bands: [{ badge: 'gold', max: '23:50' }],
    })
    expect(proposeEasierBands(v)).toEqual([{ badge: 'gold', max: '00:20' }])
  })

  it('has nothing to propose for an item with no bands', () => {
    expect(proposeEasierBands(makeVersion('i'))).toBeNull()
  })
})
