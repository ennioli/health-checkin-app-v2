import { useMemo, useState } from 'react'
import type { DayOutcome, Item } from '../types'
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_SUB } from '../types'
import { backupReminderDue } from '../lib/backup'
import { today } from '../lib/dates'
import { resolveDay } from '../lib/judge'
import { findStruggles, proposeEasierBands, type Struggle } from '../lib/suggest'
import { versionInForce } from '../lib/versions'
import { feastDates, weekCounterTotal, weekDates } from '../lib/week'
import { addDays } from '../lib/dates'
import type { Store } from '../store'
import { badgeIconFor, ItemControl } from './controls'
import { ItemEditorDialog, type EditorSeed } from './ItemEditor'

export function useDayOutcomes(store: Store, date: string, dayIsOver: boolean): DayOutcome[] {
  const { snapshot, versionsByItem, recordsByKey } = store
  return useMemo(
    () =>
      snapshot.items.map((item) => {
        const version = versionInForce(versionsByItem.get(item.id) ?? [], date)
        const record = recordsByKey.get(`${date}|${item.id}`) ?? null
        return resolveDay(item, version, record, date, { dayIsOver })
      }),
    [snapshot.items, versionsByItem, recordsByKey, date, dayIsOver],
  )
}

/**
 * The one check-in surface. Today and back-fill are the same screen — only the
 * date differs, so a past day is always judged by the standard in force then.
 */
export function CheckinView({
  store,
  date,
  onOpenData,
}: {
  store: Store
  date: string
  onOpenData: () => void
}) {
  const todayKey = today()
  const isToday = date === todayKey
  const outcomes = useDayOutcomes(store, date, date < todayKey)
  const [editing, setEditing] = useState<{ item: Item; seed: EditorSeed } | null>(null)

  const struggles = useMemo(
    () =>
      isToday
        ? findStruggles(
            store.snapshot.items,
            store.versionsByItem,
            store.recordsByKey,
            todayKey,
            store.snapshot.settings.suggestionSnoozedUntil,
          )
        : [],
    [isToday, store.snapshot, store.versionsByItem, store.recordsByKey, todayKey],
  )

  const backupDue = useMemo(
    () =>
      isToday &&
      backupReminderDue(
        store.snapshot.settings.lastBackupAt,
        store.snapshot.records.map((r) => r.date),
        todayKey,
      ),
    [isToday, store.snapshot.records, store.snapshot.settings.lastBackupAt, todayKey],
  )

  // Week context for the diet card: snack total vs cap, feast usage.
  const week = useMemo(() => {
    const dates = weekDates(date)
    const feastItem = store.snapshot.items.find((i) => i.presetKey === 'feast_day') ?? null
    const exempt = feastDates(feastItem?.id ?? null, store.recordsByKey, dates)
    return { dates, feastItem, exempt }
  }, [date, store.snapshot.items, store.recordsByKey])

  const visible = outcomes.filter(
    (o) => o.status !== 'disabled' && o.status !== 'notApplicableDay',
  )

  return (
    <>
      {backupDue ? (
        <div className="banner warn">
          <div className="row-between">
            <span>已超過 7 天沒有下載備份。資料只存在這台裝置。</span>
            <button type="button" className="small" onClick={onOpenData}>
              去備份
            </button>
          </div>
        </div>
      ) : null}

      {struggles.map((s) => (
        <SuggestionBanner
          key={s.item.id}
          store={store}
          struggle={s}
          todayKey={todayKey}
          onEdit={(seed) => setEditing({ item: s.item, seed })}
        />
      ))}

      {visible.length === 0 ? (
        <div className="card">
          <p className="muted">這一天沒有啟用且適用的項目。</p>
        </div>
      ) : (
        <div className="columns">
          {CATEGORIES.map((category) => {
            const group = visible.filter((o) => o.item.category === category)
            if (group.length === 0) return null
            return (
              <CategoryCard
                key={category}
                store={store}
                date={date}
                category={category}
                outcomes={group}
                week={week}
              />
            )
          })}
        </div>
      )}

      {editing ? (
        <ItemEditorDialog
          store={store}
          item={editing.item}
          versions={store.versionsByItem.get(editing.item.id) ?? []}
          seed={editing.seed}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}

function CategoryCard({
  store,
  date,
  category,
  outcomes,
  week,
}: {
  store: Store
  date: string
  category: (typeof CATEGORIES)[number]
  outcomes: DayOutcome[]
  week: { dates: string[]; feastItem: Item | null; exempt: Set<string> }
}) {
  // "未填" pill: any judged, required item still empty.
  const hasUnfilled = outcomes.some(
    (o) => o.status === 'unfilled' && o.version?.required && o.version.scoring === 'tiered',
  )

  // Weekly chip: the first counter with a cap (v1: 週零食飲料 0/2).
  const capped = outcomes.find(
    (o) => o.item.dataType === 'counter' && o.version?.weeklyCap !== undefined,
  )
  const capTotal = capped
    ? weekCounterTotal(capped.item.id, store.recordsByKey, week.dates, week.exempt)
    : 0

  // Feast-day guard: warn (never block) on the week's second feast day.
  const feastOnOthers = week.feastItem
    ? [...week.exempt].filter((d) => d !== date).length
    : 0
  const feastToday = week.exempt.has(date)

  return (
    <section className="card" aria-label={CATEGORY_LABEL[category]}>
      <div className="cat-head">
        <span className="cat-name">{CATEGORY_LABEL[category]}</span>
        <span className="cat-sub">{CATEGORY_SUB[category]}</span>
        <span className="spacer" />
        {capped?.version?.weeklyCap !== undefined ? (
          <span
            className={`chip${capTotal > capped.version.weeklyCap ? ' over' : ''}`}
            title="本週累計（週一至週日，大餐日不計）"
          >
            週零食飲料 {capTotal}/{capped.version.weeklyCap}
          </span>
        ) : null}
        {hasUnfilled ? <span className="pill warn">未填</span> : null}
      </div>

      {feastToday && feastOnOthers > 0 ? (
        <p className="muted" style={{ color: 'var(--warn)' }}>
          本週已有其他大餐日——每週建議至多 1 天（不會阻擋，僅提醒）。
        </p>
      ) : null}

      {outcomes.map((outcome) => (
        <ItemRow key={outcome.item.id} store={store} date={date} outcome={outcome} />
      ))}
    </section>
  )
}

function ItemRow({
  store,
  date,
  outcome,
}: {
  store: Store
  date: string
  outcome: DayOutcome
}) {
  const { item, version, record } = outcome
  if (!version) return null
  // The per-row NA button was removed at the owner's request (2026-07-29).
  // The state itself survives in the engine and in restored data — a legacy
  // record marked NA still renders (and can be cleared by picking a value).
  const na = outcome.status === 'markedNotApplicable'

  // Compact controls (bp, counter, yes/no, toggle, number) share the line
  // with the label; only the 5-badge picker and free text wrap below it.
  const wraps = item.dataType === 'fiveLevel' || item.dataType === 'text'
  return (
    <div className={wraps ? 'item-row' : 'item-row inline-row'}>
      <div className="item-label">
        <span className="name">{item.name}</span>
        {/* BP rows drop the preset hint (owner 2026-08-27): the "/" between
            the two fields already says 收縮/舒張, and the shorter label keeps
            the fields on the same line instead of wrapping under it. */}
        {version.note ? (
          <span className="hint">{version.note}</span>
        ) : item.dataType !== 'bp' && itemHint(item) ? (
          <span className="hint">{itemHint(item)}</span>
        ) : null}
      </div>
      <div className="item-control">
        {na ? <span className="pill warn">不適用</span> : null}
        {/* One-tap types show their pick in place; value-input items with
            thresholds get the computed badge displayed beside the field. */}
        {outcome.badge && item.dataType !== 'fiveLevel' && item.dataType !== 'boolean' ? (
          <span className="badge" title="依當日門檻判定">
            {badgeIconFor(outcome.badge)}
          </span>
        ) : null}
        <ItemControl
          item={item}
          version={version}
          value={record?.value ?? null}
          fallback={itemDefault(item)}
          disabled={false}
          onChange={(value) => void store.setValue(item.id, date, value)}
        />
      </div>
    </div>
  )
}

/** Preset hints/defaults live on the preset; custom items use the version note. */
import { PRESETS } from '../lib/presets'
const HINTS = new Map(PRESETS.map((p) => [p.key, p.hint]))
const DEFAULTS = new Map(PRESETS.map((p) => [p.key, p.defaultValue]))
function itemHint(item: Item): string | undefined {
  return item.presetKey ? HINTS.get(item.presetKey) : undefined
}
function itemDefault(item: Item): number | string | undefined {
  return item.presetKey ? DEFAULTS.get(item.presetKey) : undefined
}

function SuggestionBanner({
  store,
  struggle,
  todayKey,
  onEdit,
}: {
  store: Store
  struggle: Struggle
  todayKey: string
  onEdit: (seed: EditorSeed) => void
}) {
  const { item, version, badDays, consideredDays } = struggle
  const easier = proposeEasierBands(version)

  const snooze = () =>
    void store.updateSettings({
      suggestionSnoozedUntil: {
        ...store.snapshot.settings.suggestionSnoozedUntil,
        [item.id]: addDays(todayKey, 7),
      },
    })

  return (
    <div className="banner">
      <p style={{ marginTop: 0 }}>
        <strong>{item.name}</strong> 最近 {consideredDays} 個適用日裡有 {badDays} 天沒達成。
        要不要先讓它容易一點？改了才算數，這裡不會自動改。
      </p>
      <div className="row">
        {easier ? (
          <button
            type="button"
            className="small"
            onClick={() =>
              onEdit({
                patch: { bands: easier },
                title: `降低門檻：${item.name}`,
                note: '已經先幫你放寬一格，數字都還能自己再改。',
              })
            }
          >
            降低門檻
          </button>
        ) : null}
        <button
          type="button"
          className="small"
          onClick={() =>
            onEdit({ patch: {}, title: `減少頻率：${item.name}`, note: '把不想做的星期取消勾選即可。' })
          }
        >
          減少頻率
        </button>
        <button
          type="button"
          className="small"
          onClick={() =>
            onEdit({
              patch: { note: version.note },
              title: `改變方法：${item.name}`,
              note: '在「方法備註」寫下要換的做法，門檻可以維持不動。',
            })
          }
        >
          改變方法
        </button>
        <button
          type="button"
          className="small"
          onClick={() =>
            onEdit({
              patch: { enabled: false },
              title: `暫停：${item.name}`,
              note: '從生效日起不再出現在每日簽到，歷史紀錄保持不變。',
            })
          }
        >
          暫停此項
        </button>
        <button type="button" className="small ghost" onClick={snooze}>
          維持現狀
        </button>
      </div>
    </div>
  )
}
