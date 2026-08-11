import type { Badge, Item, ItemVersion, RecordValue } from '../types'
import { BADGE_ICON, BADGE_LABEL, BADGE_PICK_ORDER } from '../types'

/** One-tap five-level picker, worst → best, v1-style. */
export function BadgePicker({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: RecordValue
  disabled?: boolean
  onChange: (value: RecordValue) => void
}) {
  return (
    <div className="badge-picker" role="group" aria-label={label}>
      {BADGE_PICK_ORDER.map((badge) => (
        <button
          key={badge}
          type="button"
          disabled={disabled}
          aria-pressed={value === badge}
          aria-label={`${label}：${BADGE_LABEL[badge]}`}
          title={BADGE_LABEL[badge]}
          onClick={() => onChange(value === badge ? null : badge)}
        >
          {BADGE_ICON[badge]}
        </button>
      ))}
    </div>
  )
}

export function Counter({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: RecordValue
  disabled?: boolean
  onChange: (value: RecordValue) => void
}) {
  // Nothing recorded yet still shows 0 — that is the resting state of a counter.
  // It is muted so a real recorded 0 stays distinguishable from an untouched one.
  const committed = typeof value === 'number' && Number.isFinite(value)
  const n = committed ? (value as number) : 0
  return (
    <div className="counter" role="group" aria-label={label}>
      <button
        type="button"
        disabled={disabled || n <= 0}
        aria-label={`${label} 減一`}
        onClick={() => onChange(n - 1 <= 0 ? (n - 1 === 0 ? 0 : null) : n - 1)}
      >
        −
      </button>
      <span
        className="count"
        aria-live="polite"
        style={committed ? undefined : { color: 'var(--muted)' }}
      >
        {n}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label} 加一`}
        onClick={() => onChange(n + 1)}
      >
        ＋
      </button>
    </div>
  )
}

export function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: RecordValue
  disabled?: boolean
  onChange: (value: RecordValue) => void
}) {
  const on = value === true
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(on ? null : true)}
    />
  )
}

/**
 * Numeric field with explicit ▲▼ steppers. iOS renders no spinner on a bare
 * number input, so without these the phone would have no tap-to-adjust at
 * all. Stepping from an uncommitted default commits it (±step).
 */
function NumField({
  ariaLabel,
  shown,
  committed,
  step,
  disabled,
  onCommit,
}: {
  ariaLabel: string
  /** The string currently displayed (actual value or muted default). */
  shown: string
  committed: boolean
  step: number
  disabled?: boolean
  onCommit: (value: number | null, raw?: string) => void
}) {
  const decimals = Number.isInteger(step) ? 0 : 1
  const bump = (dir: 1 | -1) => {
    const base = shown === '' ? 0 : Number(shown)
    const next = Number((base + dir * step).toFixed(decimals))
    onCommit(next)
  }
  return (
    <span className="stepper">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        placeholder="—"
        aria-label={ariaLabel}
        disabled={disabled}
        style={committed ? undefined : { color: 'var(--muted)' }}
        value={shown}
        onChange={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))}
      />
      <span className="stepper-btns">
        <button type="button" tabIndex={-1} aria-label={`${ariaLabel} 增加`} disabled={disabled} onClick={() => bump(1)}>
          ▲
        </button>
        <button type="button" tabIndex={-1} aria-label={`${ariaLabel} 減少`} disabled={disabled} onClick={() => bump(-1)}>
          ▼
        </button>
      </span>
    </span>
  )
}

/**
 * Systolic/diastolic pair stored as a single "120/80" string.
 *
 * With no record yet, the preset default is shown muted. Nothing is written
 * until the user touches a field — and the first edit commits both sides, the
 * untouched one at its default, so "adjust one number" is a one-step act.
 */
export function BPInput({
  label,
  value,
  fallback,
  disabled,
  onChange,
}: {
  label: string
  value: RecordValue
  fallback?: string
  disabled?: boolean
  onChange: (value: RecordValue) => void
}) {
  const committed = typeof value === 'string'
  const [defSys, defDia] = (fallback ?? '/').split('/')
  const [sys, dia] = committed ? (value as string).split('/') : [defSys ?? '', defDia ?? '']
  const emit = (s: string, d: string) => {
    if (s === '' && d === '') onChange(null)
    else onChange(`${s}/${d}`)
  }
  return (
    <div className="row" role="group" aria-label={label} style={{ gap: 4, flexWrap: 'nowrap' }}>
      <NumField
        ariaLabel={`${label} 收縮壓`}
        shown={sys ?? ''}
        committed={committed}
        step={1}
        disabled={disabled}
        onCommit={(v) => emit(v === null ? '' : String(v), dia ?? '')}
      />
      <span className="muted">/</span>
      <NumField
        ariaLabel={`${label} 舒張壓`}
        shown={dia ?? ''}
        committed={committed}
        step={1}
        disabled={disabled}
        onCommit={(v) => emit(sys ?? '', v === null ? '' : String(v))}
      />
    </div>
  )
}

export function YesNo({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: RecordValue
  disabled?: boolean
  onChange: (value: RecordValue) => void
}) {
  return (
    <div className="badge-picker" role="group" aria-label={label}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === false}
        aria-label={`${label}：沒有`}
        onClick={() => onChange(value === false ? null : false)}
      >
        ✕
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={value === true}
        aria-label={`${label}：有做到`}
        onClick={() => onChange(value === true ? null : true)}
      >
        ✔
      </button>
    </div>
  )
}

/** Renders the right control for an item's data type. */
export function ItemControl({
  item,
  version,
  value,
  fallback,
  disabled,
  onChange,
}: {
  item: Item
  version: ItemVersion
  value: RecordValue
  /** Preset default shown muted while nothing is recorded yet. */
  fallback?: number | string
  disabled?: boolean
  onChange: (value: RecordValue) => void
}) {
  switch (item.dataType) {
    case 'fiveLevel':
      return <BadgePicker label={item.name} value={value} disabled={disabled} onChange={onChange} />
    case 'boolean':
      return <YesNo label={item.name} value={value} disabled={disabled} onChange={onChange} />
    case 'toggle':
      return <Toggle label={item.name} value={value} disabled={disabled} onChange={onChange} />
    case 'counter':
      return <Counter label={item.name} value={value} disabled={disabled} onChange={onChange} />
    case 'bp':
      return (
        <BPInput
          label={item.name}
          value={value}
          fallback={typeof fallback === 'string' ? fallback : undefined}
          disabled={disabled}
          onChange={onChange}
        />
      )
    case 'text':
      return (
        <textarea
          aria-label={item.name}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          placeholder="今天想記下什麼？"
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
    case 'time':
      return (
        <input
          type="time"
          aria-label={item.name}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
    case 'choice':
      return (
        <div className="badge-picker" role="group" aria-label={item.name}>
          {(version.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              aria-pressed={value === choice}
              onClick={() => onChange(value === choice ? null : choice)}
              style={{ fontSize: '0.85rem', padding: '4px 10px' }}
            >
              {choice}
            </button>
          ))}
        </div>
      )
    default: {
      // number / duration. With no record yet, the preset default is shown
      // muted; only a user change writes anything.
      const committed = typeof value === 'number'
      const shown = committed
        ? String(value)
        : typeof fallback === 'number'
          ? String(fallback)
          : ''
      const step = typeof fallback === 'number' && !Number.isInteger(fallback) ? 0.1 : 1
      return (
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <NumField
            ariaLabel={item.name}
            shown={shown}
            committed={committed}
            step={step}
            disabled={disabled}
            onCommit={(v) => onChange(v)}
          />
          {item.unit ? <span className="muted">{item.unit}</span> : null}
        </div>
      )
    }
  }
}

export function badgeIconFor(badge: Badge | null): string {
  return badge ? BADGE_ICON[badge] : ''
}
