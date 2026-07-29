import type { Item, ItemVersion } from '../types'
import { PRESETS } from './presets'

const BY_KEY = new Map(PRESETS.map((p) => [p.key, p]))

/**
 * Definitions that drifted from the preset list and need rewriting.
 * Empty arrays mean everything already matches — the normal case.
 */
export interface PresetDrift {
  items: Item[]
  versions: ItemVersion[]
}

/**
 * Re-point preset-backed items at the preset's current shape.
 *
 * A preset can change between releases — 冥想 stopped being a yes/no answer and
 * became a five-level badge pick. The item in IndexedDB was written when the
 * old preset was current, so without this an existing install keeps showing the
 * ✕/✔ control forever while a fresh install shows medals.
 *
 * Only the item's *identity* follows the preset: name, dataType, unit, and the
 * answer→badge map, which describes the control rather than the standard.
 * Everything the user can actually edit — enabled, required, applicableDays,
 * bands, note — is left exactly as they set it, and no record is touched. Old
 * values recorded under the previous control stay in the database; they simply
 * no longer earn a badge, which is the honest outcome given nothing can map a
 * "yes" onto one of five medals.
 */
export function presetDrift(items: Item[], versions: ItemVersion[]): PresetDrift {
  const nextItems: Item[] = []
  const nextVersions: ItemVersion[] = []

  for (const item of items) {
    const preset = item.presetKey ? BY_KEY.get(item.presetKey) : undefined
    if (!preset) continue
    if (
      item.name === preset.name &&
      item.dataType === preset.dataType &&
      item.unit === preset.unit
    ) {
      continue
    }

    const fixed: Item = { ...item, name: preset.name, dataType: preset.dataType }
    if (preset.unit) fixed.unit = preset.unit
    else delete fixed.unit
    nextItems.push(fixed)

    for (const version of versions) {
      if (version.itemId !== item.id) continue
      const v: ItemVersion = { ...version }
      if (preset.choiceMap) v.choiceMap = preset.choiceMap
      else delete v.choiceMap
      if (preset.choices) v.choices = preset.choices
      else delete v.choices
      nextVersions.push(v)
    }
  }

  return { items: nextItems, versions: nextVersions }
}
