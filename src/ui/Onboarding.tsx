import { useState } from 'react'
import { CATEGORY_LABEL } from '../types'
import { today } from '../lib/dates'
import { PRESETS } from '../lib/presets'
import type { Store } from '../store'

/**
 * First run. Everything here is deliberately gentle: the defaults are easy to
 * hit, and the copy says so — an app you can fail on day one is an app you
 * stop opening on day three.
 */
export function Onboarding({ store }: { store: Store }) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(PRESETS.filter((p) => !p.optional).map((p) => p.key)),
  )
  const [busy, setBusy] = useState(false)

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const start = async () => {
    setBusy(true)
    await store.addPresetItems(
      PRESETS.filter((p) => selected.has(p.key)),
      today(),
    )
    await store.updateSettings({ onboarded: true })
    setBusy(false)
  }

  return (
    <>
      <h1>先挑幾件容易做到的事</h1>
      <p className="muted">
        門檻現在都調得很寬鬆，先把「每天打開來簽到」變成習慣就好。等順了再調緊，之後的修改不會動到過去的紀錄。
      </p>

      {PRESETS.map((preset) => (
        <div className="card" key={preset.key}>
          <div className="checkline">
            <input
              id={`p-${preset.key}`}
              type="checkbox"
              checked={selected.has(preset.key)}
              onChange={() => toggle(preset.key)}
            />
            <label htmlFor={`p-${preset.key}`}>
              <strong>{preset.name}</strong>
              <span className="muted"> ・{CATEGORY_LABEL[preset.category]}</span>
              {preset.hint ? (
                <>
                  <br />
                  <span className="muted">{preset.hint}</span>
                </>
              ) : null}
            </label>
          </div>
        </div>
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="primary"
          disabled={selected.size === 0 || busy}
          onClick={() => void start()}
        >
          {busy ? '建立中…' : `開始使用（${selected.size} 項）`}
        </button>
      </div>
      <p className="muted">項目之後都能在「計畫」頁新增、停用或刪除。</p>
    </>
  )
}
