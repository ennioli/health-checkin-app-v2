import { useState } from 'react'
import type { Band, Item, ItemVersion } from '../types'
import { BADGE_ICON, BADGE_LABEL } from '../types'
import { today } from '../lib/dates'
import { sortVersions } from '../lib/versions'
import type { Store } from '../store'

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export interface EditorSeed {
  patch: Partial<ItemVersion>
  title: string
  note?: string
}

/**
 * Edits a standard by appending a new version with an effective date. The
 * dialog states plainly that days before that date keep their old standard,
 * because that is the property most likely to be misunderstood — and the one
 * the whole data model exists to protect.
 */
export function ItemEditorDialog({
  store,
  item,
  versions,
  seed,
  onClose,
}: {
  store: Store
  item: Item
  versions: ItemVersion[]
  seed?: EditorSeed
  onClose: () => void
}) {
  const sorted = sortVersions(versions)
  const base = sorted.at(-1)!
  const [draft, setDraft] = useState<ItemVersion>({ ...base, ...seed?.patch })
  const [effectiveFrom, setEffectiveFrom] = useState(today())
  const [saving, setSaving] = useState(false)

  const setBand = (index: number, key: 'min' | 'max', raw: string) => {
    setDraft((d) => {
      const bands = [...(d.bands ?? [])]
      const band: Band = { ...bands[index] }
      if (raw === '') {
        delete band[key]
      } else {
        band[key] = /^\d{2}:\d{2}$/.test(raw) ? raw : Number(raw)
      }
      bands[index] = band
      return { ...d, bands }
    })
  }

  const save = async () => {
    setSaving(true)
    await store.appendVersion(
      item.id,
      {
        enabled: draft.enabled,
        required: draft.required,
        applicableDays: draft.applicableDays,
        bands: draft.bands,
        note: draft.note,
      },
      effectiveFrom,
    )
    setSaving(false)
    onClose()
  }

  const isTime = item.dataType === 'time'

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={`編輯 ${item.name}`}>
      <div className="dialog">
        <h3>{seed?.title ?? `編輯：${item.name}`}</h3>
        {seed?.note ? <p className="muted">{seed.note}</p> : null}

        <div className="field">
          <label htmlFor="eff">生效日</label>
          <input
            id="eff"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
          <p className="muted">
            這次修改只影響 {effectiveFrom} 起的簽到。之前的日子仍用當時的標準判定，既有結果不會被改寫。
          </p>
        </div>

        <div className="field">
          <div className="checkline">
            <input
              id="enabled"
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            <label htmlFor="enabled">啟用此項目</label>
          </div>
        </div>

        <div className="field">
          <div className="checkline">
            <input
              id="required"
              type="checkbox"
              checked={draft.required}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            />
            <label htmlFor="required">必填（未填會算未達成）</label>
          </div>
        </div>

        <div className="field">
          <label>適用星期</label>
          <div className="row">
            {DAY_LABELS.map((label, day) => {
              const on = draft.applicableDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  className="small"
                  aria-pressed={on}
                  style={{
                    borderColor: on ? 'var(--accent)' : undefined,
                    minWidth: 44,
                  }}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      applicableDays: on
                        ? draft.applicableDays.filter((d) => d !== day)
                        : [...draft.applicableDays, day].sort(),
                    })
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {draft.bands && draft.bands.length > 0 ? (
          <div className="field">
            <label>五級門檻{isTime ? '（HH:MM）' : item.unit ? `（${item.unit}）` : ''}</label>
            {draft.bands.map((band, i) => (
              <div className="band-row" key={band.badge}>
                <span className="badge" title={BADGE_LABEL[band.badge]}>
                  {BADGE_ICON[band.badge]}
                </span>
                <input
                  aria-label={`${BADGE_LABEL[band.badge]} 下限`}
                  placeholder="下限（可空）"
                  value={band.min === undefined ? '' : String(band.min)}
                  onChange={(e) => setBand(i, 'min', e.target.value)}
                />
                <input
                  aria-label={`${BADGE_LABEL[band.badge]} 上限`}
                  placeholder="上限（可空）"
                  value={band.max === undefined ? '' : String(band.max)}
                  onChange={(e) => setBand(i, 'max', e.target.value)}
                />
              </div>
            ))}
            <p className="muted">由上到下依序比對，第一個符合的就是當日徽章；全部落空為 ⊘。</p>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="note">方法備註</label>
          <input
            id="note"
            value={draft.note ?? ''}
            placeholder="例如：改成睡前散步 10 分鐘"
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>

        <details>
          <summary className="muted">版次歷史（{sorted.length}）</summary>
          <ul className="version-list">
            {sorted.map((v) => (
              <li key={v.id}>
                {v.effectiveFrom} 起・{v.enabled ? '啟用' : '停用'}・
                {v.required ? '必填' : '選填'}
                {v.note ? `・${v.note}` : ''}
              </li>
            ))}
          </ul>
        </details>

        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
            儲存為新版次
          </button>
          <button type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
