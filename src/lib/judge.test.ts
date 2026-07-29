import { describe, expect, it } from 'vitest'
import { judge, resolveDay, summarize } from './judge'
import { makeItem, makeRecord, makeVersion } from '../test/fixtures'
import type { Band } from '../types'

// Inline threshold sets. Bands remain fully supported for custom items even
// though the v1-style presets are one-tap self-judged.
const WATER_BANDS: Band[] = [
  { badge: 'diamond', min: 2500 },
  { badge: 'gold', min: 2000 },
  { badge: 'silver', min: 1600 },
  { badge: 'bronze', min: 1200 },
]

const SLEEP_RANGE_BANDS: Band[] = [
  { badge: 'diamond', min: 7.5, max: 9 },
  { badge: 'gold', min: 7, max: 9.5 },
  { badge: 'silver', min: 6.5, max: 10 },
  { badge: 'bronze', min: 6, max: 10.5 },
]

const BEDTIME_BANDS: Band[] = [
  { badge: 'diamond', max: '22:30' },
  { badge: 'gold', max: '23:30' },
  { badge: 'silver', max: '00:15' },
  { badge: 'bronze', max: '01:00' },
]

describe('judge — numeric bands', () => {
  const v = makeVersion('i', { bands: WATER_BANDS, direction: 'atLeast' })

  it('walks bands best to worst and takes the first match', () => {
    expect(judge(3000, v)).toBe('diamond')
    expect(judge(2500, v)).toBe('diamond')
    expect(judge(2100, v)).toBe('gold')
    expect(judge(1700, v)).toBe('silver')
    expect(judge(1200, v)).toBe('bronze')
    expect(judge(900, v)).toBe('miss')
  })

  it('treats band bounds as inclusive', () => {
    expect(judge(2000, v)).toBe('gold')
    expect(judge(1999, v)).toBe('silver')
  })
})

describe('judge — range bands', () => {
  const v = makeVersion('i', { bands: SLEEP_RANGE_BANDS, direction: 'range' })

  it('fails on both sides of the range, not just the low side', () => {
    expect(judge(8, v)).toBe('diamond')
    expect(judge(7.2, v)).toBe('gold')
    expect(judge(9.4, v)).toBe('gold')
    // Sleeping longer keeps dropping tiers instead of staying "excellent".
    expect(judge(9.7, v)).toBe('silver')
    expect(judge(10.2, v)).toBe('bronze')
    expect(judge(11, v)).toBe('miss')
    expect(judge(5, v)).toBe('miss')
  })
})

describe('judge — time with a noon anchor', () => {
  const v = makeVersion('i', { bands: BEDTIME_BANDS, direction: 'atMost', anchor: 'noon' })

  it('ranks a post-midnight bedtime as later than a pre-midnight one', () => {
    expect(judge('22:00', v)).toBe('diamond')
    expect(judge('23:00', v)).toBe('gold')
    expect(judge('00:10', v)).toBe('silver')
    expect(judge('00:50', v)).toBe('bronze')
    expect(judge('02:00', v)).toBe('miss')
  })

  it('does not rank 00:30 as better than 23:30', () => {
    expect(judge('23:30', v)).toBe('gold')
    expect(judge('00:30', v)).toBe('bronze')
  })
})

describe('judge — one-tap and mapped types', () => {
  it('takes a five-level pick at face value (v1 one-tap)', () => {
    const v = makeVersion('i')
    expect(judge('diamond', v)).toBe('diamond')
    expect(judge('gold', v)).toBe('gold')
    expect(judge('miss', v)).toBe('miss')
  })

  it('maps yes/no through the explicit answer map', () => {
    const v = makeVersion('i', { choiceMap: { yes: 'gold', no: 'miss' } })
    expect(judge(true, v)).toBe('gold')
    expect(judge(false, v)).toBe('miss')
  })

  it('treats an unmapped answer as a miss rather than a silent pass', () => {
    const v = makeVersion('i', { choiceMap: { yes: 'gold' } })
    expect(judge('maybe', v)).toBe('miss')
  })

  it('gives free text no badge at all', () => {
    const v = makeVersion('i', { scoring: 'none' })
    expect(judge('今天很累', v)).toBeNull()
  })

  it('earns a badge for observe items too', () => {
    const v = makeVersion('i', { scoring: 'observe' })
    expect(judge('silver', v)).toBe('silver')
  })
})

describe('resolveDay — the four states stay distinguishable', () => {
  const item = makeItem({ dataType: 'number' })
  const version = makeVersion(item.id, { bands: WATER_BANDS })

  it('separates unfilled from filled-but-missed', () => {
    const unfilled = resolveDay(item, version, null, '2026-03-02', { dayIsOver: true })
    expect(unfilled.status).toBe('unfilled')
    expect(unfilled.achieved).toBe(false)
    expect(unfilled.badge).toBeNull()

    const missed = resolveDay(
      item,
      version,
      makeRecord(item.id, '2026-03-02', 500),
      '2026-03-02',
      { dayIsOver: true },
    )
    expect(missed.status).toBe('filled')
    expect(missed.achieved).toBe(false)
    expect(missed.badge).toBe('miss')
  })

  it('does not fail an unfilled item while the day is still running', () => {
    const o = resolveDay(item, version, null, '2026-03-02', { dayIsOver: false })
    expect(o.status).toBe('unfilled')
    expect(o.achieved).toBeNull()
  })

  it('never counts a not-applicable day as an achievement', () => {
    const rec = makeRecord(item.id, '2026-03-02', null, { notApplicable: true })
    const o = resolveDay(item, version, rec, '2026-03-02', { dayIsOver: true })
    expect(o.status).toBe('markedNotApplicable')
    expect(o.achieved).toBeNull()
  })

  it('drops a disabled item out of the day entirely', () => {
    const off = makeVersion(item.id, { enabled: false })
    const o = resolveDay(item, off, null, '2026-03-02', { dayIsOver: true })
    expect(o.status).toBe('disabled')
    expect(o.achieved).toBeNull()
  })

  it('skips days the item does not apply to', () => {
    // 2026-03-02 is a Monday.
    const weekendOnly = makeVersion(item.id, { applicableDays: [0, 6] })
    const o = resolveDay(item, weekendOnly, null, '2026-03-02', { dayIsOver: true })
    expect(o.status).toBe('notApplicableDay')
  })

  it('counts a recorded-only item as done once it is filled', () => {
    const weight = makeItem({ dataType: 'number', category: 'weight', name: '晨測體重' })
    const v = makeVersion(weight.id, { scoring: 'recorded' })
    const o = resolveDay(weight, v, makeRecord(weight.id, '2026-03-02', 70.5), '2026-03-02', {
      dayIsOver: true,
    })
    expect(o.achieved).toBe(true)
    expect(o.badge).toBeNull()
  })
})

describe('resolveDay — observe items (核心)', () => {
  const core = makeItem({ dataType: 'fiveLevel', category: 'fitness', name: '核心' })
  const v = makeVersion(core.id, { scoring: 'observe', required: false })

  it('shows the badge but never moves the achieved/missed counts', () => {
    const o = resolveDay(core, v, makeRecord(core.id, '2026-03-02', 'gold'), '2026-03-02', {
      dayIsOver: true,
    })
    expect(o.badge).toBe('gold')
    expect(o.achieved).toBeNull()
  })

  it('never fails when left unfilled, even after the day ends', () => {
    const required = makeVersion(core.id, { scoring: 'observe', required: true })
    const o = resolveDay(core, required, null, '2026-03-02', { dayIsOver: true })
    expect(o.achieved).toBeNull()
  })

  it('a picked ⊘ still shows as ⊘ without counting as missed', () => {
    const o = resolveDay(core, v, makeRecord(core.id, '2026-03-02', 'miss'), '2026-03-02', {
      dayIsOver: true,
    })
    expect(o.badge).toBe('miss')
    expect(o.achieved).toBeNull()
  })
})

describe('summarize', () => {
  it('reports each state separately instead of one aggregate score', () => {
    const item = makeItem({ dataType: 'number' })
    const version = makeVersion(item.id, { bands: WATER_BANDS })
    const outcomes = [
      resolveDay(item, version, makeRecord(item.id, '2026-03-02', 2600), '2026-03-02', {
        dayIsOver: true,
      }),
      resolveDay(item, version, makeRecord(item.id, '2026-03-02', 100), '2026-03-02', {
        dayIsOver: true,
      }),
      resolveDay(item, version, null, '2026-03-02', { dayIsOver: true }),
      resolveDay(
        item,
        version,
        makeRecord(item.id, '2026-03-02', null, { notApplicable: true }),
        '2026-03-02',
        { dayIsOver: true },
      ),
    ]
    expect(summarize(outcomes)).toEqual({
      achieved: 1,
      missed: 2, // the filled-but-low one, plus the unfilled required one
      unfilled: 1,
      notApplicable: 1,
      counted: 3,
    })
  })

  it('does not count an unfilled optional item as 未填', () => {
    const note = makeItem({ dataType: 'text', category: 'mind', name: '今日備註' })
    const version = makeVersion(note.id, { scoring: 'none', required: false })
    const o = resolveDay(note, version, null, '2026-03-02', { dayIsOver: true })
    expect(o.status).toBe('unfilled')
    expect(summarize([o])).toEqual({
      achieved: 0,
      missed: 0,
      unfilled: 0,
      notApplicable: 0,
      counted: 0,
    })
  })
})
