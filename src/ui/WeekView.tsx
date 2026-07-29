import { Fragment, useMemo } from 'react'
import { BADGE_ICON, CATEGORIES, CATEGORY_LABEL, CATEGORY_SUB } from '../types'
import { addDays, today, weekdayLabel } from '../lib/dates'
import { feastDates, weekCounterTotal, weekDates, weekRows, weekSummary } from '../lib/week'
import { versionInForce } from '../lib/versions'
import type { Store } from '../store'

/**
 * v1-style week review: ONE table for everything, with category header rows
 * spanning the full width. The columns are a rolling 7-day window ending on
 * the currently selected date, so the top ‹ › arrows slide the window.
 * Every cell is judged by the version in force on that cell's day.
 */
export function WeekView({
  store,
  date,
  onPickDate,
}: {
  store: Store
  date: string
  onPickDate: (date: string) => void
}) {
  const todayKey = today()
  // Rolling window ending on the selected date (v1 behaviour).
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)), [date])

  const rows = useMemo(
    () =>
      weekRows(store.snapshot.items, store.versionsByItem, store.recordsByKey, dates, todayKey),
    [store.snapshot.items, store.versionsByItem, store.recordsByKey, dates, todayKey],
  )

  const summary = useMemo(() => weekSummary(rows, todayKey), [rows, todayKey])

  // Contract counters stay calendar-week (Mon–Sun of the selected date),
  // independent of the displayed window — the snack cap is a weekly contract,
  // not a trailing-window one.
  const calWeek = useMemo(() => weekDates(date), [date])
  const feastItem = store.snapshot.items.find((i) => i.presetKey === 'feast_day') ?? null
  const exempt = useMemo(
    () => feastDates(feastItem?.id ?? null, store.recordsByKey, calWeek),
    [feastItem, store.recordsByKey, calWeek],
  )
  const snacksItem = store.snapshot.items.find((i) => i.presetKey === 'snacks') ?? null
  const snacksCap = snacksItem
    ? versionInForce(store.versionsByItem.get(snacksItem.id) ?? [], date)?.weeklyCap
    : undefined
  const snacksTotal = snacksItem
    ? weekCounterTotal(snacksItem.id, store.recordsByKey, calWeek, exempt)
    : 0

  const range = `${fmtShort(dates[0])} – ${fmtShort(dates[6])}`

  return (
    <section className="card" aria-label="近一週">
      <div className="cat-head">
        <span className="cat-name">近一週</span>
        <span className="cat-sub">{range}</span>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        視窗以目前選取日為結尾，可用上方 ‹ › 移動；左右滑動看全部日期。
      </p>

      <div className="row" style={{ marginBottom: 8 }}>
        <span className="pill ok">達成 {summary.achieved}</span>
        <span className="pill bad">未達 {summary.missed}</span>
        <span className="pill warn">未填 {summary.unfilled}</span>
        <span className="pill">不適用 {summary.notApplicable}</span>
        {snacksItem && snacksCap !== undefined ? (
          <span
            className={`chip${snacksTotal > snacksCap ? ' over' : ''}`}
            title="本週（週一至週日）累計，大餐日不計"
          >
            週零食飲料 {snacksTotal}/{snacksCap}
          </span>
        ) : null}
        {feastItem ? (
          <span className="chip" title="本週（週一至週日）">
            大餐日 {exempt.size}/1
          </span>
        ) : null}
      </div>

      <div className="scroll-x">
        <table className="week-table">
          <thead>
            <tr>
              <th style={{ width: '26%' }} />
              {dates.map((d) => (
                <th
                  key={d}
                  className={
                    (d === todayKey ? 'today-col ' : '') + (d === date ? 'sel-col' : '')
                  }
                >
                  <button type="button" onClick={() => onPickDate(d)} title={`前往 ${d}`}>
                    {fmtShort(d)}
                    <br />
                    {weekdayLabel(d).replace('週', '')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => {
              const catRows = rows.filter(
                (r) =>
                  r.item.category === category &&
                  // Hide rows that are disabled across the whole window.
                  r.cells.some((c) => c.outcome && c.outcome.status !== 'disabled'),
              )
              if (catRows.length === 0) return null
              return (
                <Fragment key={category}>
                  <tr className="week-cat-row">
                    <td colSpan={8}>
                      <strong>{CATEGORY_LABEL[category]}</strong>{' '}
                      <span className="muted">{CATEGORY_SUB[category]}</span>
                    </td>
                  </tr>
                  {catRows.map((row) => (
                    <tr key={row.item.id}>
                      <td className="item-name-cell" title={row.item.name}>
                        {row.item.name}
                        {row.item.unit ? (
                          <span className="muted"> {row.item.unit}</span>
                        ) : null}
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.date} className={cell.date === date ? 'sel-col' : undefined}>
                          <CellGlyph cell={cell} todayKey={todayKey} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginBottom: 0 }}>
        💎🥇🥈🥉 徽章・✗ 未填（計未達）・— 不適用・數字/✔ 已記錄・· 未填
      </p>
    </section>
  )
}

function CellGlyph({
  cell,
  todayKey,
}: {
  cell: ReturnType<typeof weekRows>[number]['cells'][number]
  todayKey: string
}) {
  const o = cell.outcome
  if (!o || o.status === 'disabled') return <span className="muted">·</span>
  if (o.status === 'notApplicableDay') return <span className="muted"> </span>
  if (o.status === 'markedNotApplicable') return <span className="muted">—</span>
  if (o.status === 'unfilled') {
    if (cell.date > todayKey) return <span className="muted"> </span>
    return o.achieved === false ? (
      <span className="cell-badge" title="未填（計未達）">✗</span>
    ) : (
      <span className="muted" title="尚未填寫">·</span>
    )
  }
  // filled
  if (o.badge) {
    return <span className="cell-badge">{BADGE_ICON[o.badge]}</span>
  }
  const v = o.record?.value
  if (typeof v === 'number') return <span className="cell-badge">{v}</span>
  if (v === true) return <span className="cell-badge">✔</span>
  if (typeof v === 'string' && o.item.dataType === 'bp') {
    return <span className="cell-badge" style={{ fontSize: '0.7rem' }}>{v}</span>
  }
  return <span className="cell-badge">✔</span>
}

function fmtShort(dateKey: string): string {
  return `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8))}`
}
