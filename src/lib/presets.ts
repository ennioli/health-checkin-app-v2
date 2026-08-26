import type { Badge, Category, DataType, Scoring, TimeAnchor } from '../types'

export interface Preset {
  key: string
  category: Category
  name: string
  dataType: DataType
  unit?: string
  scoring: Scoring
  direction?: 'atLeast' | 'atMost' | 'range'
  anchor?: TimeAnchor
  choices?: string[]
  choiceMap?: Record<string, Badge>
  weeklyCap?: number
  required?: boolean
  /** Day-of-week numbers (0 = Sunday). Defaults to every day. */
  applicableDays?: number[]
  hint?: string
  /**
   * Pre-filled starting value shown muted in the field. Nothing is recorded
   * until the user actually changes or confirms it.
   */
  defaultValue?: number | string
  /** Off by default — available but not pushed on the user at setup. */
  optional?: boolean
}

/**
 * The v1 item set, carried over verbatim (minus 無螢幕餐, dropped by the
 * owner) plus the new mind section. Most behavioural items are one-tap
 * five-level self-judged — that is the core of what made v1 stick.
 */
export const PRESETS: Preset[] = [
  // ── 血壓（短期觀察）─────────────────────────────────────────────
  {
    key: 'bp_morning',
    category: 'bp',
    name: '早',
    dataType: 'bp',
    scoring: 'none',
    required: false,
    defaultValue: '120/80',
    hint: '收縮 / 舒張',
  },
  {
    key: 'bp_evening',
    category: 'bp',
    name: '晚',
    dataType: 'bp',
    scoring: 'none',
    required: false,
    defaultValue: '120/80',
    hint: '收縮 / 舒張',
  },

  // ── 睡眠 sleep-early-habit ──────────────────────────────────────
  {
    key: 'wake_0800',
    category: 'sleep',
    name: '08:00 ±15 分起床',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '記昨夜',
  },
  {
    key: 'chess_curfew',
    category: 'sleep',
    name: '棋類宵禁',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '23:00 不開局',
  },
  {
    key: 'bed_0000',
    category: 'sleep',
    name: '00:00 上床・無螢幕',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '昨晚午夜',
  },
  {
    key: 'sleep_0030',
    category: 'sleep',
    name: '00:30 前入睡',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '依穿戴裝置',
  },

  // ── 減重 steady-weight-loss ─────────────────────────────────────
  {
    key: 'weight_morning',
    category: 'weight',
    name: '晨測體重',
    dataType: 'number',
    unit: 'kg',
    scoring: 'recorded',
    defaultValue: 77.6,
    hint: '如廁後空腹',
  },
  {
    key: 'nosnack_cutoff',
    category: 'weight',
    name: '宵夜截止',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '23:00 後無固體',
  },
  {
    key: 'bento',
    category: 'weight',
    name: '便當達標',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '非炸・飯≤½・菜≥2',
  },
  {
    key: 'waist',
    category: 'weight',
    name: '腰圍',
    dataType: 'number',
    unit: '吋',
    scoring: 'recorded',
    required: false,
    applicableDays: [0], // 每週一次，預設週日量；可在計畫頁改
    hint: '肚臍高・吐氣後',
  },

  // ── 飲食 good-diet-habit ────────────────────────────────────────
  {
    key: 'feast_day',
    category: 'diet',
    name: '大餐日',
    dataType: 'toggle',
    scoring: 'none',
    required: false,
    hint: '週≤1・零食不入上限',
  },
  {
    key: 'snacks',
    category: 'diet',
    name: '零食＋含糖飲料',
    dataType: 'counter',
    scoring: 'none',
    required: false,
    weeklyCap: 5,
    hint: '週上限 5',
  },
  {
    key: 'fried',
    category: 'diet',
    name: '油炸＋非原生食物',
    dataType: 'counter',
    scoring: 'none',
    required: false,
    hint: '大餐照記',
  },
  {
    key: 'fruit',
    category: 'diet',
    name: '水果份',
    dataType: 'counter',
    scoring: 'none',
    required: false,
    hint: '1 份≈1 拳',
  },

  // ── 健身 strength-cardio-reshape ────────────────────────────────
  {
    key: 'stretch',
    category: 'fitness',
    name: '伸展',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '~2 分鐘',
  },
  {
    key: 'strength',
    category: 'fitness',
    name: '肌力',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '2×12・RPE 7',
  },
  {
    key: 'interval',
    category: 'fitness',
    name: '間歇有氧',
    dataType: 'fiveLevel',
    scoring: 'tiered',
  },
  {
    key: 'steady_cardio',
    category: 'fitness',
    name: '穩態有氧',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '1 萬步',
  },
  {
    key: 'core',
    category: 'fitness',
    name: '核心',
    dataType: 'fiveLevel',
    scoring: 'observe',
    required: false,
    hint: '觀察・不計達成',
  },

  // ── 心境 mind（新增）────────────────────────────────────────────
  {
    key: 'calm',
    category: 'mind',
    name: '今日平靜程度',
    dataType: 'fiveLevel',
    scoring: 'tiered',
  },
  {
    key: 'meditation',
    category: 'mind',
    name: '冥想',
    dataType: 'fiveLevel',
    scoring: 'tiered',
    hint: '≥ 2 分鐘',
  },
  {
    key: 'note',
    category: 'mind',
    name: '今日備註',
    dataType: 'text',
    scoring: 'none',
    required: false,
    optional: true,
    hint: '情境紀錄・不計成敗',
  },
]

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
