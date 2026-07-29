import { describe, expect, it } from 'vitest'
import { versionInForce } from './versions'
import { judge, resolveDay } from './judge'
import { makeItem, makeRecord, makeVersion } from '../test/fixtures'

describe('versionInForce', () => {
  const item = 'item-x'
  const v1 = makeVersion(item, { effectiveFrom: '2026-01-01' })
  const v2 = makeVersion(item, { effectiveFrom: '2026-03-01' })
  const v3 = makeVersion(item, { effectiveFrom: '2026-06-01' })
  const all = [v3, v1, v2] // deliberately unordered

  it('picks the latest version at or before the date', () => {
    expect(versionInForce(all, '2026-02-14')?.id).toBe(v1.id)
    expect(versionInForce(all, '2026-03-01')?.id).toBe(v2.id)
    expect(versionInForce(all, '2026-12-31')?.id).toBe(v3.id)
  })

  it('returns nothing for dates before the item existed', () => {
    expect(versionInForce(all, '2025-12-31')).toBeNull()
  })

  it('lets the later edit win when two share an effective date', () => {
    const a = makeVersion(item, { effectiveFrom: '2026-05-01', createdAt: '2026-04-01T10:00:00Z' })
    const b = makeVersion(item, { effectiveFrom: '2026-05-01', createdAt: '2026-04-02T10:00:00Z' })
    expect(versionInForce([a, b], '2026-05-02')?.id).toBe(b.id)
  })
})

describe('changing a standard does not rewrite history', () => {
  const item = makeItem({ dataType: 'number', name: '飲水量' })
  const lenient = makeVersion(item.id, {
    effectiveFrom: '2026-01-01',
    bands: [{ badge: 'gold', min: 1000 }],
  })
  const strict = makeVersion(item.id, {
    effectiveFrom: '2026-03-01',
    bands: [{ badge: 'gold', min: 2500 }],
  })
  const versions = [lenient, strict]

  it('judges each day by the standard in force that day', () => {
    const before = '2026-02-10'
    const after = '2026-03-10'
    const value = 1500

    const vBefore = versionInForce(versions, before)!
    const vAfter = versionInForce(versions, after)!

    expect(judge(value, vBefore)).toBe('gold')
    expect(judge(value, vAfter)).toBe('miss')
  })

  it('keeps an old day gold after a stricter standard is introduced', () => {
    const date = '2026-02-10'
    const record = makeRecord(item.id, date, 1500)
    const outcome = resolveDay(item, versionInForce(versions, date), record, date, {
      dayIsOver: true,
    })
    expect(outcome.badge).toBe('gold')
    expect(outcome.achieved).toBe(true)
  })

  it('back-fills an old day with the old standard, not today’s', () => {
    // Filled in late — the record is created now, but the day is still judged
    // by what was in force back then.
    const date = '2026-02-20'
    const record = makeRecord(item.id, date, 1100, {
      filledAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-01T10:00:00.000Z',
    })
    const outcome = resolveDay(item, versionInForce(versions, date), record, date, {
      dayIsOver: true,
    })
    expect(outcome.badge).toBe('gold')
  })
})
