export const CATEGORIES = ['bp', 'sleep', 'weight', 'diet', 'fitness', 'mind'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL: Record<Category, string> = {
  bp: '血壓',
  sleep: '睡眠',
  weight: '減重',
  diet: '飲食',
  fitness: '健身',
  mind: '心境',
}

/** Small caption next to the category name, v1-style. */
export const CATEGORY_SUB: Record<Category, string> = {
  bp: '短期觀察',
  sleep: 'sleep-early-habit',
  weight: 'steady-weight-loss',
  diet: 'good-diet-habit',
  fitness: 'strength-cardio-reshape',
  mind: 'mind',
}

export const DATA_TYPES = [
  'time',
  'number',
  'duration',
  'boolean',
  'toggle',
  'counter',
  'choice',
  'fiveLevel',
  'text',
  'bp',
] as const
export type DataType = (typeof DATA_TYPES)[number]

export const BADGES = ['diamond', 'gold', 'silver', 'bronze', 'miss'] as const
export type Badge = (typeof BADGES)[number]
export type EarnedBadge = Exclude<Badge, 'miss'>

/** Best → worst. The judgment engine walks bands in exactly this order. */
export const BADGE_ORDER: EarnedBadge[] = ['diamond', 'gold', 'silver', 'bronze']

/** Worst → best. The one-tap picker renders in exactly this order (v1). */
export const BADGE_PICK_ORDER: Badge[] = ['miss', 'bronze', 'silver', 'gold', 'diamond']

export const BADGE_ICON: Record<Badge, string> = {
  diamond: '💎',
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  miss: '⊘',
}

export const BADGE_LABEL: Record<Badge, string> = {
  diamond: '超標',
  gold: '完全',
  silver: '大致',
  bronze: '部分',
  miss: '未達',
}

/** How a filled value turns into a day's outcome. */
export type Scoring =
  /** Five graded bands / an explicit answer→badge map. */
  | 'tiered'
  /** Recording it at all is the point (weight, waist). Filled = ✅, no tier. */
  | 'recorded'
  /** Badge is shown but never counted toward achieved/missed (核心). */
  | 'observe'
  /** Context only (free text, BP observation, counters). Never ✅ or ❌. */
  | 'none'

/**
 * Time-of-day values are compared on a linear scale, so the day has to be cut
 * somewhere. Bedtime crosses midnight (23:30 and 00:30 are adjacent, and 00:30
 * is *later*), so it is anchored at noon. Wake time does not, and anchoring it
 * at noon would rank a 13:00 wake-up as excellent — so it stays at midnight.
 */
export type TimeAnchor = 'noon' | 'midnight'

/** Identity of a tracked item. Nothing here affects how a day is judged. */
export interface Item {
  id: string
  category: Category
  name: string
  dataType: DataType
  unit?: string
  createdAt: string
  /** Set when the item came from the built-in preset list. */
  presetKey?: string
}

/**
 * One band of the five-tier scale. `min`/`max` are inclusive. For `time`
 * items they are 'HH:MM' strings; for numbers they are numbers. Omitting a
 * bound means unbounded on that side.
 */
export interface Band {
  badge: EarnedBadge
  min?: number | string
  max?: number | string
}

/**
 * Every setting that can change how a check-in is judged lives here, stamped
 * with the date it takes effect. Editing a standard appends a new version; it
 * never rewrites an old one. That is the whole mechanism behind "changing a
 * standard only affects days on or after its effective date".
 */
export interface ItemVersion {
  id: string
  itemId: string
  /** YYYY-MM-DD. In force for every date >= this, until a later version. */
  effectiveFrom: string
  enabled: boolean
  required: boolean
  /** Day-of-week numbers the item applies to. 0 = Sunday. */
  applicableDays: number[]
  scoring: Scoring
  /** UI hint for the threshold editor. The engine only reads `bands`. */
  direction?: 'atLeast' | 'atMost' | 'range'
  bands?: Band[]
  anchor?: TimeAnchor
  /** For `boolean` ('yes'/'no') and `choice` items: answer → badge. */
  choiceMap?: Record<string, Badge>
  /** Allowed answers for `choice` items, in display order. */
  choices?: string[]
  /** For `counter` items: Mon–Sun cap shown as a chip on the category card. */
  weeklyCap?: number
  note?: string
  createdAt: string
}

export type RecordValue = number | string | boolean | null

export interface DayRecord {
  /** `${date}|${itemId}` */
  key: string
  date: string
  itemId: string
  value: RecordValue
  /** Only ever set by an explicit user action. Never inferred. */
  notApplicable: boolean
  /** The version this entry was judged against, for reproducibility. */
  versionId: string
  filledAt: string
  updatedAt: string
}

export interface Settings {
  lastBackupAt: string | null
  /** itemId → ISO date the user dismissed the ease-off suggestion. */
  suggestionSnoozedUntil: Record<string, string>
  onboarded: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  lastBackupAt: null,
  suggestionSnoozedUntil: {},
  onboarded: false,
}

/** What an item resolved to on one specific day. */
export type DayStatus =
  | 'disabled'
  | 'notApplicableDay'
  | 'markedNotApplicable'
  | 'unfilled'
  | 'filled'

export interface DayOutcome {
  item: Item
  version: ItemVersion | null
  status: DayStatus
  record: DayRecord | null
  badge: Badge | null
  /** true = ✅, false = ❌, null = not counted either way. */
  achieved: boolean | null
}

export const BACKUP_SCHEMA_VERSION = 1

export interface BackupDefinition {
  item: Item
  versions: ItemVersion[]
}

export interface BackupFile {
  schema_version: number
  exported_at: string
  app_version: string
  definitions: BackupDefinition[]
  settings: Settings
  /** date → itemId → record */
  records: Record<string, Record<string, DayRecord>>
}
