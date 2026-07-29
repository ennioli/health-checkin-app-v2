import { useState } from 'react'
import type { Band, Category, DataType, Item, Scoring } from '../types'
import { BADGE_ICON, BADGE_ORDER, CATEGORIES, CATEGORY_LABEL } from '../types'
import { today } from '../lib/dates'
import { ALL_DAYS, PRESETS } from '../lib/presets'
import { versionInForce } from '../lib/versions'
import type { CustomItemInput, Store } from '../store'
import { ItemEditorDialog } from './ItemEditor'

export function Plan({ store }: { store: Store }) {
  const todayKey = today()
  const [editing, setEditing] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)

  const usedPresetKeys = new Set(store.snapshot.items.map((i) => i.presetKey).filter(Boolean))
  const availablePresets = PRESETS.filter((p) => !usedPresetKeys.has(p.key))

  return (
    <>
      <p className="muted">
        調整標準會建立新版次；生效日之前的紀錄與判定完全不受影響。
      </p>

      {CATEGORIES.map((category) => {
        const items = store.snapshot.items.filter((i) => i.category === category)
        if (items.length === 0) return null
        return (
          <section key={category}>
            <h2>{CATEGORY_LABEL[category]}</h2>
            {items.map((item) => {
              const versions = store.versionsByItem.get(item.id) ?? []
              const current = versionInForce(versions, todayKey)
              return (
                <div className="card" key={item.id}>
                  <div className="row-between">
                    <span className="item-name">{item.name}</span>
                    <span className="pill">{current?.enabled ? '啟用中' : '已停用'}</span>
                  </div>
                  <p className="muted" style={{ margin: '4px 0' }}>
                    {describeVersion(item, current)}
                  </p>
                  <div className="row">
                    <button type="button" className="small" onClick={() => setEditing(item)}>
                      編輯標準
                    </button>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="small danger ghost"
                      onClick={() => {
                        const ok = window.confirm(
                          `刪除「${item.name}」會一併刪除它的所有歷史紀錄，且無法復原。\n\n若只是想停用，請改用「編輯標準」取消勾選「啟用」。\n\n仍要刪除嗎？`,
                        )
                        if (ok) void store.removeItem(item.id)
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}

      <h2>新增項目</h2>
      <div className="card">
        {availablePresets.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>從預設項目加入：</p>
            <div className="row">
              {availablePresets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="small"
                  onClick={() => void store.addPresetItem(p, todayKey)}
                >
                  ＋ {p.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>預設項目都已加入。</p>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setAdding(true)}>
            ＋ 自訂項目
          </button>
        </div>
      </div>

      {editing ? (
        <ItemEditorDialog
          store={store}
          item={editing}
          versions={store.versionsByItem.get(editing.id) ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {adding ? <CustomItemDialog store={store} onClose={() => setAdding(false)} /> : null}
    </>
  )
}

function describeVersion(item: Item, version: ReturnType<typeof versionInForce>): string {
  if (!version) return '尚無版次'
  const parts: string[] = []
  parts.push(version.required ? '必填' : '選填')
  parts.push(
    version.applicableDays.length === 7
      ? '每天'
      : `每週 ${version.applicableDays.length} 天`,
  )
  if (version.scoring === 'recorded') parts.push('記錄即完成')
  if (version.scoring === 'none') parts.push('不計成敗')
  if (version.bands?.length) {
    const gold = version.bands.find((b) => b.badge === 'gold')
    if (gold) {
      const bound = gold.min !== undefined ? `≥ ${gold.min}` : `≤ ${gold.max}`
      parts.push(`🥇 ${bound}${item.unit ?? ''}`)
    }
  }
  parts.push(`自 ${version.effectiveFrom} 起`)
  return parts.join('・')
}

const DATA_TYPE_LABEL: Record<DataType, string> = {
  time: '時間',
  number: '數值',
  duration: '時數／分鐘',
  boolean: '是非',
  toggle: '開關',
  counter: '計數器',
  choice: '單選',
  fiveLevel: '五級選擇',
  text: '文字備註',
  bp: '血壓（收縮/舒張）',
}

function CustomItemDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('mind')
  const [dataType, setDataType] = useState<DataType>('fiveLevel')
  const [unit, setUnit] = useState('')
  const [direction, setDirection] = useState<'atLeast' | 'atMost' | 'range'>('atLeast')
  const [bounds, setBounds] = useState<Record<string, string>>({})

  const needsBands = dataType === 'number' || dataType === 'duration' || dataType === 'time'
  const boundKey = direction === 'atMost' ? 'max' : 'min'

  const save = async () => {
    if (!name.trim()) return
    let bands: Band[] | undefined
    let scoring: Scoring = 'tiered'

    if (needsBands) {
      const filled = BADGE_ORDER.filter((b) => (bounds[b] ?? '').trim() !== '')
      if (filled.length === 0) {
        // No thresholds given — recording it is the point, like body weight.
        scoring = 'recorded'
      } else {
        bands = filled.map((badge) => {
          const raw = bounds[badge].trim()
          const value: number | string = /^\d{1,2}:\d{2}$/.test(raw) ? raw : Number(raw)
          return { badge, [boundKey]: value } as Band
        })
      }
    } else if (dataType === 'text') {
      scoring = 'none'
    }

    const input: CustomItemInput = {
      category,
      name: name.trim(),
      dataType,
      unit: unit.trim() || undefined,
      scoring,
      direction: needsBands ? direction : undefined,
      bands,
      anchor: dataType === 'time' ? 'midnight' : undefined,
      choiceMap: dataType === 'boolean' ? { yes: 'gold', no: 'miss' } : undefined,
      required: scoring !== 'none',
      applicableDays: ALL_DAYS,
    }
    await store.addCustomItem(input, today())
    onClose()
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="新增自訂項目">
      <div className="dialog">
        <h3>新增自訂項目</h3>

        <div className="field">
          <label htmlFor="cname">名稱</label>
          <input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="ccat">大類</label>
          <select
            id="ccat"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ctype">資料型態</label>
          <select
            id="ctype"
            value={dataType}
            onChange={(e) => setDataType(e.target.value as DataType)}
          >
            {(Object.keys(DATA_TYPE_LABEL) as DataType[]).map((t) => (
              <option key={t} value={t}>
                {DATA_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {needsBands ? (
          <>
            <div className="field">
              <label htmlFor="cunit">單位（可留空）</label>
              <input
                id="cunit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="例如 ml、分鐘、kg"
              />
            </div>
            <div className="field">
              <label htmlFor="cdir">判定方向</label>
              <select
                id="cdir"
                value={direction}
                onChange={(e) => setDirection(e.target.value as typeof direction)}
              >
                <option value="atLeast">至少（越多越好）</option>
                <option value="atMost">至多（越少／越早越好）</option>
                <option value="range">區間（自訂上下限）</option>
              </select>
            </div>
            <div className="field">
              <label>五級門檻（留空的等級就不使用；全部留空＝只記錄不判定）</label>
              {BADGE_ORDER.map((badge) => (
                <div className="band-row" key={badge}>
                  <span className="badge">{BADGE_ICON[badge]}</span>
                  <input
                    aria-label={`${badge} 門檻`}
                    value={bounds[badge] ?? ''}
                    placeholder={direction === 'atMost' ? '上限' : '下限'}
                    onChange={(e) => setBounds({ ...bounds, [badge]: e.target.value })}
                  />
                  <span className="muted">{unit || (dataType === 'time' ? 'HH:MM' : '')}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="primary" disabled={!name.trim()} onClick={() => void save()}>
            新增
          </button>
          <button type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
