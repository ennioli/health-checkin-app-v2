import { useMemo } from 'react'
import { BADGE_ICON, CATEGORIES, CATEGORY_LABEL, CATEGORY_SUB } from '../types'
import { today, weekdayLabel } from '../lib/dates'
import { feastDates, weekCounterTotal, weekDates, weekRows, weekSummary } from '../lib/week'
import { versionInForce } from '../lib/versions'
import type { Store } from '../store'

/**
 * Mon–Sun review: the summary card lives here (deliberately not on the main
 * check-in screen), followed by one item × seven-day badge matrix per
 * category. Every cell is judged by the version in force on that cell's day.
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
  const dates = useMemo(() => weekDates(date), [date])

  const rows = useMemo(
    () =>
      weekRows(store.snapshot.items, store.versionsByItem, store.recordsByKey, dates, todayKey),
    [store.snapshot.items, store.versionsByItem, store.recordsByKey, dates, todayKey],
  )

  const summary = useMemo(() => weekSummary(rows, todayKey), [rows, todayKey])

  const feastItem = store.snapshot.items.find((i) => i.presetKey === 'feast_day') ?? null
  const exempt = useMemo(
    () => feastDates(feastItem?.id ?? null, store.recordsByKey, dates),
    [feastItem, store.recordsByKey, dates],
  )

  const snacksItem = store.snapshot.items.find((i) => i.presetKey === 'snacks') ?? null
  const snacksCap = snacksItem
    ? versionInForce(store.versionsByItem.get(snacksItem.id) ?? [], date)?.weeklyCap
    : undefined
  const snacksTotal = snacksItem
    ? weekCounterTotal(snacksItem.id, store.recordsByKey, dates, exempt)
    : 0

  const range = `${fmtShort(dates[0])} – ${fmtShort(dates[6])}`

  return (
    <>
      <section className="card" aria-label="本週摘要">
        <div className="cat-head">
          <span className="cat-name">本週摘要</span>
          <span className="cat-sub">{range}</span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="pill ok">達成 {summary.achieved}</span>
          <span className="pill bad">未達 {summary.missed}</span>
          <span className="pill warn">未填 {summary.unfilled}</span>
          <span className="pill">不適用 {summary.notApplicable}</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {snacksItem && snacksCap !== undefined ? (
            <span className={`chip${snacksTotal > snacksCap ? ' over' : ''}`}>
              週零食飲料 {snacksTotal}/{snacksCap}
            </span>
          ) : null}
          {feastItem ? <span className="chip">大餐日 {exempt.size}/1</span> : null}
        </div>
      </section>

      {CATEGORIES.map((category) => {
        const catRows = rows.filter(
          (r) =>
            r.item.category === category &&
            // Hide rows that are disabled across the whole week.
            r.cells.some((c) => c.outcome && c.outcome.status !== 'disabled'),
        )
        if (catRows.length === 0) return null
        return (
          <section className="card" key={category} aria-label={`${CATEGORY_LABEL[category]} 週表`}>
            <div className="cat-head">
              <span className="cat-name">{CATEGORY_LABEL[category]}</span>
              <span className="cat-sub">{CATEGORY_SUB[category]}</span>
            </div>
            <div className="scroll-x">
              <table className="week-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }} />
                    {dates.map((d) => (
                      <th key={d} className={d === todayKey ? 'today-col' : undefined}>
                        <button type="button" onClick={() => onPickDate(d)} title={`前往 ${d}`}>
                          {weekdayLabel(d).replace('週', '')}
                          <br />
                          {Number(d.slice(8))}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catRows.map((row) => (
                    <tr key={row.item.id}>
                      <td className="item-name-cell" title={row.item.name}>
                        {row.item.name}
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.date}>
                          <CellGlyph cell={cell} todayKey={todayKey} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
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
