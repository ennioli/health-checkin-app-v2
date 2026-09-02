import { useMemo, useState } from "react";
import type { Category, DayOutcome, Item } from "../types";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_SUB } from "../types";
import { backupReminderDue } from "../lib/backup";
import { today } from "../lib/dates";
import { resolveDay } from "../lib/judge";
import {
  findStruggles,
  proposeEasierBands,
  type Struggle,
} from "../lib/suggest";
import {
  bucketAt,
  freshen,
  isCollapsed,
  loadCollapse,
  saveCollapse,
  toggle as toggleCollapse,
} from "../lib/collapse";
import { versionInForce } from "../lib/versions";
import { feastDates, weekCounterTotal, weekDates } from "../lib/week";
import { addDays } from "../lib/dates";
import type { Store } from "../store";
import { badgeIconFor, ItemControl } from "./controls";
import { ItemEditorDialog, type EditorSeed } from "./ItemEditor";

export function useDayOutcomes(
  store: Store,
  date: string,
  dayIsOver: boolean,
): DayOutcome[] {
  const { snapshot, versionsByItem, recordsByKey } = store;
  return useMemo(
    () =>
      snapshot.items.map((item) => {
        const version = versionInForce(versionsByItem.get(item.id) ?? [], date);
        const record = recordsByKey.get(`${date}|${item.id}`) ?? null;
        return resolveDay(item, version, record, date, { dayIsOver });
      }),
    [snapshot.items, versionsByItem, recordsByKey, date, dayIsOver],
  );
}

/**
 * The last numeric value each item carried before `date`.
 *
 * Body weight moves by grams between mornings and the waist by nothing at all
 * from one Sunday to the next, so opening the field on a fixed preset number
 * means retyping a value the app already knows (owner, 2026-08-30). The carried
 * value is shown muted exactly like the preset default was — nothing is written
 * until the user commits it — and the preset default still covers the very
 * first fill. Text and bp values are skipped: only numbers carry over.
 */
function useCarriedValues(store: Store, date: string): Map<string, number> {
  return useMemo(() => {
    const latest = new Map<string, { date: string; value: number }>();
    for (const record of store.snapshot.records) {
      if (record.date >= date) continue;
      if (typeof record.value !== "number") continue;
      const prev = latest.get(record.itemId);
      if (!prev || record.date > prev.date) {
        latest.set(record.itemId, { date: record.date, value: record.value });
      }
    }
    const out = new Map<string, number>();
    for (const [itemId, hit] of latest) out.set(itemId, hit.value);
    return out;
  }, [store.snapshot.records, date]);
}

/**
 * Which category cards are folded away, and the tap that changes it.
 *
 * The layout answers to the clock by default — 飲食 and 健身 have not happened
 * yet at breakfast, 睡眠 is finished by lunchtime — and a tap overrides the
 * clock until the day or the half-day turns over, at which point the automatic
 * answer comes back rather than a stale morning layout persisting into the
 * night (owner 2026-09-02).
 */
function useCollapse() {
  const now = new Date();
  const stamp = today();
  const bucket = bucketAt(now);
  const [state, setState] = useState(() =>
    freshen(loadCollapse(), stamp, bucket),
  );
  const fresh = freshen(state, stamp, bucket);
  if (fresh !== state) setState(fresh);
  return {
    is: (category: Category) => isCollapsed(fresh, category),
    toggle: (category: Category) => {
      const next = toggleCollapse(fresh, category);
      setState(next);
      saveCollapse(next);
    },
  };
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
  store: Store;
  date: string;
  onOpenData: () => void;
}) {
  const todayKey = today();
  const isToday = date === todayKey;
  const outcomes = useDayOutcomes(store, date, date < todayKey);
  const carried = useCarriedValues(store, date);
  const collapse = useCollapse();
  const [editing, setEditing] = useState<{
    item: Item;
    seed: EditorSeed;
  } | null>(null);

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
    [
      isToday,
      store.snapshot,
      store.versionsByItem,
      store.recordsByKey,
      todayKey,
    ],
  );

  const backupDue = useMemo(
    () =>
      isToday &&
      backupReminderDue(
        store.snapshot.settings.lastBackupAt,
        store.snapshot.records.map((r) => r.date),
        todayKey,
      ),
    [
      isToday,
      store.snapshot.records,
      store.snapshot.settings.lastBackupAt,
      todayKey,
    ],
  );

  // Week context for the diet card: snack total vs cap, feast usage.
  const week = useMemo(() => {
    const dates = weekDates(date);
    const feastItem =
      store.snapshot.items.find((i) => i.presetKey === "feast_day") ?? null;
    const exempt = feastDates(feastItem?.id ?? null, store.recordsByKey, dates);
    return { dates, feastItem, exempt };
  }, [date, store.snapshot.items, store.recordsByKey]);

  const visible = outcomes.filter(
    (o) => o.status !== "disabled" && o.status !== "notApplicableDay",
  );

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
            const group = visible.filter((o) => o.item.category === category);
            if (group.length === 0) return null;
            return (
              <CategoryCard
                key={category}
                store={store}
                date={date}
                category={category}
                outcomes={group}
                carried={carried}
                week={week}
                collapsed={collapse.is(category)}
                onToggleCollapse={() => collapse.toggle(category)}
              />
            );
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
  );
}

function CategoryCard({
  store,
  date,
  category,
  outcomes,
  carried,
  week,
  collapsed,
  onToggleCollapse,
}: {
  store: Store;
  date: string;
  category: (typeof CATEGORIES)[number];
  outcomes: DayOutcome[];
  carried: Map<string, number>;
  week: { dates: string[]; feastItem: Item | null; exempt: Set<string> };
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  // Same-shaped value fields in one category share a single row behind a
  // toggle (owner 2026-09-02): 早/晚 blood pressure are taken ~15 hours apart
  // and never in one sitting, and 晨測體重/腰圍 are the same morning field with
  // two different tapes. Two stacked rows spend permanent height on a field
  // that is wrong for the moment. Grouped by dataType rather than preset keys,
  // so a third reading of either kind joins its own group automatically.
  const grouped = ["bp", "number"].map((t) =>
    outcomes.filter((o) => o.item.dataType === t),
  );
  const paired = grouped.find((g) => g.length > 1) ?? [];
  const [shownPair, setShownPair] = useState(0);
  const at = Math.min(shownPair, Math.max(paired.length - 1, 0));
  const active = paired[at];
  const next = paired.length > 1 ? paired[(at + 1) % paired.length] : undefined;
  const nextRecorded =
    next?.record != null &&
    next.record.value !== null &&
    next.record.value !== "";
  // The shared field always occupies the FIRST group member's slot, and every
  // other member is dropped from its own. Filtering in place would move 腰圍
  // down to where it happens to sit in the list and shove 宵夜截止/便當達標
  // around on every tap (owner 2026-09-02). The slot also keeps a stable React
  // key, so switching swaps the field in place instead of remounting the row.
  const slotKey = paired.length > 1 ? `pair-${paired[0].item.id}` : "";
  const visible: Array<{ key: string; outcome: DayOutcome }> =
    paired.length > 1
      ? outcomes.flatMap((o) => {
          if (o.item.dataType !== active.item.dataType) {
            return [{ key: o.item.id, outcome: o }];
          }
          return o.item.id === paired[0].item.id
            ? [{ key: slotKey, outcome: active }]
            : [];
        })
      : outcomes.map((o) => ({ key: o.item.id, outcome: o }));

  // "未填" pill: any judged, required item still empty.
  const hasUnfilled = outcomes.some(
    (o) =>
      o.status === "unfilled" &&
      o.version?.required &&
      o.version.scoring === "tiered",
  );

  // One weekly chip per capped counter, labelled with the item's own name.
  // 零食甜食 and 含糖飲料 are two separate contracts (owner 2026-08-31), so a
  // single hard-coded chip would silently hide one of them.
  const capped = outcomes
    .filter(
      (o) =>
        o.item.dataType === "counter" && o.version?.weeklyCap !== undefined,
    )
    .map((o) => ({
      item: o.item,
      cap: o.version!.weeklyCap!,
      total: weekCounterTotal(
        o.item.id,
        store.recordsByKey,
        week.dates,
        week.exempt,
      ),
    }));

  // Feast-day guard: warn (never block) on the week's second feast day.
  const feastOnOthers = week.feastItem
    ? [...week.exempt].filter((d) => d !== date).length
    : 0;
  const feastToday = week.exempt.has(date);

  return (
    <section className="card" aria-label={CATEGORY_LABEL[category]}>
      <div className="cat-head">
        {/* The name folds the card; the chips and the field switch stay outside
            the button, both because a button cannot nest one and because they
            must keep reporting while the card is shut. */}
        <button
          type="button"
          className="cat-toggle"
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        >
          <span className="chev" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="cat-name">{CATEGORY_LABEL[category]}</span>
          {/* The field switch rides in this same row, so the caption yields to
              it rather than pushing the header onto a second line. */}
          {paired.length > 1 ? null : (
            <span className="cat-sub">{CATEGORY_SUB[category]}</span>
          )}
        </button>
        <span className="spacer" />
        {next ? (
          // One button, not a two-tab strip (owner 2026-09-02): it names the
          // field you are NOT looking at, so the word you tap is the thing you
          // get. Three or more readings cycle. The dot is the only way to know
          // the hidden one is already recorded.
          <button
            type="button"
            className="field-switch"
            aria-label={
              nextRecorded
                ? `切換到 ${next.item.name}（已記錄）`
                : `切換到 ${next.item.name}`
            }
            onClick={() => setShownPair((i) => (i + 1) % paired.length)}
          >
            ⇄ {next.item.name}
            {nextRecorded ? <span aria-hidden="true"> ●</span> : null}
          </button>
        ) : null}

        {capped.map((c) => (
          <span
            key={c.item.id}
            className={`chip${c.total > c.cap ? " over" : ""}`}
            title="本週累計（週一至週日，大餐日不計）"
          >
            週{c.item.name} {c.total}/{c.cap}
          </span>
        ))}
        {hasUnfilled ? <span className="pill warn">未填</span> : null}
      </div>

      {collapsed ? null : (
        <>
          {feastToday && feastOnOthers > 0 ? (
            <p className="muted" style={{ color: "var(--warn)" }}>
              本週已有其他大餐日——每週建議至多 1 天（不會阻擋，僅提醒）。
            </p>
          ) : null}

          {visible.map(({ key, outcome }) => (
            <ItemRow
              key={key}
              store={store}
              date={date}
              outcome={outcome}
              carried={carried.get(outcome.item.id)}
            />
          ))}
        </>
      )}
    </section>
  );
}

function ItemRow({
  store,
  date,
  outcome,
  carried,
}: {
  store: Store;
  date: string;
  outcome: DayOutcome;
  /** Last numeric value before this day, shown muted until committed. */
  carried?: number;
}) {
  const { item, version, record } = outcome;
  if (!version) return null;
  // The per-row NA button was removed at the owner's request (2026-07-29).
  // The state itself survives in the engine and in restored data — a legacy
  // record marked NA still renders (and can be cleared by picking a value).
  const na = outcome.status === "markedNotApplicable";

  // Compact controls (bp, counter, yes/no, toggle, number) share the line
  // with the label; only the 5-badge picker and free text wrap below it.
  const wraps = item.dataType === "fiveLevel" || item.dataType === "text";
  return (
    <div className={wraps ? "item-row" : "item-row inline-row"}>
      <div className="item-label">
        <span className="name">{item.name}</span>
        {/* BP rows drop the preset hint (owner 2026-08-27): the "/" between
            the two fields already says 收縮/舒張, and the shorter label keeps
            the fields on the same line instead of wrapping under it. */}
        {version.note ? (
          <span className="hint">{version.note}</span>
        ) : item.dataType !== "bp" && itemHint(item) ? (
          <span className="hint">{itemHint(item)}</span>
        ) : null}
      </div>
      <div className="item-control">
        {na ? <span className="pill warn">不適用</span> : null}
        {/* One-tap types show their pick in place; value-input items with
            thresholds get the computed badge displayed beside the field. */}
        {outcome.badge &&
        item.dataType !== "fiveLevel" &&
        item.dataType !== "boolean" ? (
          <span className="badge" title="依當日門檻判定">
            {badgeIconFor(outcome.badge)}
          </span>
        ) : null}
        <ItemControl
          item={item}
          version={version}
          value={record?.value ?? null}
          fallback={itemDefault(item)}
          carried={carried}
          disabled={false}
          onChange={(value) => void store.setValue(item.id, date, value)}
        />
      </div>
    </div>
  );
}

/** Preset hints/defaults live on the preset; custom items use the version note. */
import { PRESETS } from "../lib/presets";
const HINTS = new Map(PRESETS.map((p) => [p.key, p.hint]));
const DEFAULTS = new Map(PRESETS.map((p) => [p.key, p.defaultValue]));
function itemHint(item: Item): string | undefined {
  return item.presetKey ? HINTS.get(item.presetKey) : undefined;
}
function itemDefault(item: Item): number | string | undefined {
  return item.presetKey ? DEFAULTS.get(item.presetKey) : undefined;
}

function SuggestionBanner({
  store,
  struggle,
  todayKey,
  onEdit,
}: {
  store: Store;
  struggle: Struggle;
  todayKey: string;
  onEdit: (seed: EditorSeed) => void;
}) {
  const { item, version, badDays, consideredDays } = struggle;
  const easier = proposeEasierBands(version);

  const snooze = () =>
    void store.updateSettings({
      suggestionSnoozedUntil: {
        ...store.snapshot.settings.suggestionSnoozedUntil,
        [item.id]: addDays(todayKey, 7),
      },
    });

  return (
    <div className="banner">
      <p style={{ marginTop: 0 }}>
        <strong>{item.name}</strong> 最近 {consideredDays} 個適用日裡有{" "}
        {badDays} 天沒達成。 要不要先讓它容易一點？改了才算數，這裡不會自動改。
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
                note: "已經先幫你放寬一格，數字都還能自己再改。",
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
            onEdit({
              patch: {},
              title: `減少頻率：${item.name}`,
              note: "把不想做的星期取消勾選即可。",
            })
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
              note: "在「方法備註」寫下要換的做法，門檻可以維持不動。",
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
              note: "從生效日起不再出現在每日簽到，歷史紀錄保持不變。",
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
  );
}
