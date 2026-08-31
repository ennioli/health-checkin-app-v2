import { describe, expect, it } from 'vitest'
import { presetDrift } from './reconcile'
import { PRESETS } from './presets'
import { makeItem, makeVersion } from '../test/fixtures'

/** The 冥想 item exactly as an install predating the badge switch stored it. */
function legacyMeditation() {
  const item = makeItem({
    category: 'mind',
    name: '冥想 2 分鐘',
    dataType: 'boolean',
    presetKey: 'meditation',
  })
  const version = makeVersion(item.id, { choiceMap: { yes: 'gold', no: 'miss' } })
  return { item, version }
}

describe('presetDrift', () => {
  it('re-points a legacy item at the preset it came from', () => {
    const { item, version } = legacyMeditation()
    const drift = presetDrift([item], [version])

    expect(drift.items).toHaveLength(1)
    expect(drift.items[0].name).toBe('冥想')
    expect(drift.items[0].dataType).toBe('fiveLevel')
    // The item keeps its identity: same row, same history, same id.
    expect(drift.items[0].id).toBe(item.id)
  })

  it('drops the answer→badge map, which described the retired control', () => {
    const { item, version } = legacyMeditation()
    const drift = presetDrift([item], [version])

    expect(drift.versions).toHaveLength(1)
    expect(drift.versions[0]).not.toHaveProperty('choiceMap')
  })

  it('leaves everything the user can edit untouched', () => {
    const { item } = legacyMeditation()
    const version = makeVersion(item.id, {
      choiceMap: { yes: 'gold', no: 'miss' },
      enabled: false,
      required: false,
      applicableDays: [1, 3, 5],
      note: '睡前那次',
    })
    const drift = presetDrift([item], [version])

    expect(drift.versions[0]).toMatchObject({
      enabled: false,
      required: false,
      applicableDays: [1, 3, 5],
      note: '睡前那次',
      effectiveFrom: version.effectiveFrom,
      id: version.id,
    })
  })

  it('rewrites every version of the item, so history uses one control', () => {
    const { item, version } = legacyMeditation()
    const later = makeVersion(item.id, {
      effectiveFrom: '2026-05-01',
      choiceMap: { yes: 'gold', no: 'miss' },
    })
    const drift = presetDrift([item], [version, later])
    expect(drift.versions).toHaveLength(2)
  })

  it('is a no-op once the item already matches — no write on every load', () => {
    const item = makeItem({
      category: 'mind',
      name: '冥想',
      dataType: 'fiveLevel',
      presetKey: 'meditation',
    })
    const drift = presetDrift([item], [makeVersion(item.id)])
    expect(drift.items).toHaveLength(0)
    expect(drift.versions).toHaveLength(0)
  })

  it('follows a changed weekly cap, which no editor lets the user set', () => {
    const item = makeItem({
      category: 'diet',
      name: '零食甜食',
      dataType: 'counter',
      presetKey: 'snacks',
    })
    // Created when the contract still said 2/week.
    const version = makeVersion(item.id, { scoring: 'none', weeklyCap: 2 })
    const drift = presetDrift([item], [version])

    // The item itself never drifted, so only the version is rewritten.
    expect(drift.items).toHaveLength(0)
    expect(drift.versions).toHaveLength(1)
    expect(drift.versions[0].weeklyCap).toBe(PRESETS.find((p) => p.key === 'snacks')!.weeklyCap)
    expect(drift.versions[0].id).toBe(version.id)
  })

  it('never touches custom items or unknown preset keys', () => {
    const custom = makeItem({ name: '喝水', dataType: 'number' })
    const retired = makeItem({ name: '無螢幕餐', presetKey: 'no_screen_meal' })
    const drift = presetDrift([custom, retired], [])
    expect(drift.items).toHaveLength(0)
  })

  it('agrees with every current preset, so a fresh install never drifts', () => {
    const items = PRESETS.map((p) =>
      makeItem({
        category: p.category,
        name: p.name,
        dataType: p.dataType,
        unit: p.unit,
        presetKey: p.key,
      }),
    )
    const versions = items.map((item, i) =>
      makeVersion(item.id, { weeklyCap: PRESETS[i].weeklyCap }),
    )
    const drift = presetDrift(items, versions)
    expect(drift.items).toHaveLength(0)
    expect(drift.versions).toHaveLength(0)
  })
})
