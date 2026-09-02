import { beforeEach, describe, expect, it } from 'vitest'
import {
  bucketAt,
  defaultCollapsed,
  freshen,
  isCollapsed,
  loadCollapse,
  saveCollapse,
  toggle,
  type CollapseState,
} from './collapse'

const at = (h: number) => new Date(2026, 8, 2, h, 30)

describe('bucketAt', () => {
  it('treats 04:00 to noon as the morning fill', () => {
    expect(bucketAt(at(4))).toBe('morning')
    expect(bucketAt(at(8))).toBe('morning')
    expect(bucketAt(at(11))).toBe('morning')
  })

  it('puts the small hours with the night that is ending, not the morning', () => {
    // A 00:30 check-in is the evening reading being logged, not tomorrow.
    expect(bucketAt(at(0))).toBe('rest')
    expect(bucketAt(at(3))).toBe('rest')
    expect(bucketAt(at(12))).toBe('rest')
    expect(bucketAt(at(23))).toBe('rest')
  })
})

describe('automatic layout', () => {
  it('hides what has not happened yet in the morning', () => {
    expect(defaultCollapsed('diet', 'morning')).toBe(true)
    expect(defaultCollapsed('fitness', 'morning')).toBe(true)
    expect(defaultCollapsed('sleep', 'morning')).toBe(false)
  })

  it('hides what is already done after noon', () => {
    expect(defaultCollapsed('sleep', 'rest')).toBe(true)
    expect(defaultCollapsed('diet', 'rest')).toBe(false)
    expect(defaultCollapsed('fitness', 'rest')).toBe(false)
  })

  it('leaves the categories both halves of the day return to open', () => {
    for (const bucket of ['morning', 'rest'] as const) {
      expect(defaultCollapsed('bp', bucket)).toBe(false)
      expect(defaultCollapsed('weight', bucket)).toBe(false)
      expect(defaultCollapsed('mind', bucket)).toBe(false)
    }
  })
})

describe('overrides', () => {
  const base: CollapseState = { date: '2026-09-02', bucket: 'morning', overrides: {} }

  it('a tap wins over the automatic answer, in both directions', () => {
    const opened = toggle(base, 'diet')
    expect(isCollapsed(opened, 'diet')).toBe(false)
    const closed = toggle(opened, 'sleep')
    expect(isCollapsed(closed, 'sleep')).toBe(true)
    expect(isCollapsed(closed, 'diet')).toBe(false)
  })

  it('an override survives inside its own day and half-day', () => {
    const opened = toggle(base, 'diet')
    expect(freshen(opened, '2026-09-02', 'morning')).toBe(opened)
  })

  it('crossing noon or the date line hands the layout back to the clock', () => {
    const opened = toggle(base, 'diet')
    expect(freshen(opened, '2026-09-02', 'rest').overrides).toEqual({})
    expect(freshen(opened, '2026-09-03', 'morning').overrides).toEqual({})
    expect(freshen(null, '2026-09-02', 'morning').overrides).toEqual({})
  })
})

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips', () => {
    const s = toggle({ date: '2026-09-02', bucket: 'rest', overrides: {} }, 'sleep')
    saveCollapse(s)
    expect(loadCollapse()).toEqual(s)
  })

  it('returns null rather than throwing on junk', () => {
    localStorage.setItem('checkin-collapse-v1', '{not json')
    expect(loadCollapse()).toBeNull()
    localStorage.setItem('checkin-collapse-v1', '{"nope":1}')
    expect(loadCollapse()).toBeNull()
  })
})
