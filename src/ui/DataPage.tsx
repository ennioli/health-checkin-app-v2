import { useRef, useState } from 'react'
import {
  APP_VERSION,
  backupFilename,
  backupToSnapshot,
  buildBackup,
  downloadJSON,
  serializeBackup,
  statsFromBackup,
  statsFromSnapshot,
  type BackupStats,
} from '../lib/backup'
import { today } from '../lib/dates'
import { loadSnapshot } from '../lib/db'
import { parseAndValidate } from '../lib/validate'
import type { BackupFile } from '../types'
import type { Store } from '../store'

type Stage =
  | { kind: 'idle' }
  | { kind: 'rejected'; filename: string; errors: string[] }
  | { kind: 'confirm'; filename: string; backup: BackupFile }
  | { kind: 'done'; message: string }

export function DataPage({ store }: { store: Store }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [safetySaved, setSafetySaved] = useState(false)
  const [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStats = statsFromSnapshot(store.snapshot)

  const downloadBackup = async () => {
    const dateKey = today()
    const backup = buildBackup(store.snapshot, new Date().toISOString())
    downloadJSON(backupFilename(dateKey), serializeBackup(backup))
    await store.updateSettings({ lastBackupAt: new Date().toISOString() })
  }

  const pickFile = async (file: File) => {
    setError(null)
    setSafetySaved(false)
    setSafetyConfirmed(false)
    const text = await file.text()
    const result = parseAndValidate(text)
    if (!result.ok || !result.backup) {
      // Nothing has touched the database at this point, and nothing will.
      setStage({ kind: 'rejected', filename: file.name, errors: result.errors })
      return
    }
    setStage({ kind: 'confirm', filename: file.name, backup: result.backup })
  }

  const downloadSafety = () => {
    try {
      const backup = buildBackup(store.snapshot, new Date().toISOString())
      downloadJSON(backupFilename(today(), 'health-checkin-safety'), serializeBackup(backup))
      setSafetySaved(true)
    } catch (err) {
      setSafetySaved(false)
      setError(`無法產生 safety backup，還原已停止：${String(err)}`)
    }
  }

  const doRestore = async (backup: BackupFile) => {
    setBusy(true)
    setError(null)
    try {
      const next = backupToSnapshot(backup)
      await store.applyRestore(next)

      // Read it back and check it actually landed, rather than trusting that
      // the write "must have" worked.
      const after = await loadSnapshot()
      const expected = statsFromBackup(backup)
      if (
        after.items.length !== expected.itemCount ||
        after.records.length !== expected.recordCount
      ) {
        setError(
          `還原後驗證不符：預期 ${expected.itemCount} 個項目／${expected.recordCount} 筆紀錄，` +
            `實際 ${after.items.length}／${after.records.length}。請用剛才的 safety backup 還原。`,
        )
        setBusy(false)
        return
      }

      await store.updateSettings({ lastBackupAt: new Date().toISOString() })
      setStage({
        kind: 'done',
        message: `已全量取代：${expected.itemCount} 個項目、${expected.dayCount} 天、${expected.recordCount} 筆紀錄。備份提醒週期已重新開始。`,
      })
    } catch (err) {
      setError(`還原失敗，既有資料未被更動：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <div className="card">
        <h3>目前資料</h3>
        <StatsTable label="這台裝置" stats={currentStats} />
        <p className="muted">
          最近備份：
          {store.snapshot.settings.lastBackupAt
            ? new Date(store.snapshot.settings.lastBackupAt).toLocaleString('zh-TW')
            : '從未'}
        </p>
        <button type="button" className="primary" onClick={() => void downloadBackup()}>
          下載備份 JSON
        </button>
        <p className="muted">
          檔名 {backupFilename(today())}・app {APP_VERSION}。請把它存到這台裝置以外的地方。
        </p>
      </div>

      <div className="card">
        <h3>從備份還原</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          還原是<strong>全量取代</strong>，不是合併：目前這台裝置上的所有資料會被檔案內容整個換掉。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickFile(f)
          }}
        />
      </div>

      {error ? <div className="banner warn">{error}</div> : null}

      {stage.kind === 'rejected' ? (
        <div className="card">
          <h3>已拒絕整份檔案</h3>
          <p className="muted">
            {stage.filename} 沒有通過驗證，因此<strong>完全沒有匯入</strong>，既有資料保持不變。
          </p>
          <ul className="errors">
            {stage.errors.slice(0, 40).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {stage.errors.length > 40 ? <li>…另有 {stage.errors.length - 40} 項問題</li> : null}
          </ul>
          <button type="button" onClick={() => setStage({ kind: 'idle' })}>
            關閉
          </button>
        </div>
      ) : null}

      {stage.kind === 'confirm' ? (
        <div className="card">
          <h3>確認還原</h3>
          <p className="muted" style={{ marginTop: 0 }}>{stage.filename} 驗證通過。</p>
          <div className="scroll-x">
            <CompareTable current={currentStats} incoming={statsFromBackup(stage.backup)} />
          </div>

          <h3 style={{ marginTop: 16 }}>步驟 1：先保住現在的資料</h3>
          <button type="button" onClick={downloadSafety}>
            下載目前資料的 safety backup
          </button>

          <div className="field" style={{ marginTop: 10 }}>
            <div className="checkline">
              <input
                id="safety-confirm"
                type="checkbox"
                disabled={!safetySaved}
                checked={safetyConfirmed}
                onChange={(e) => setSafetyConfirmed(e.target.checked)}
              />
              <label htmlFor="safety-confirm">
                我已經確認 safety backup 檔案真的存下來了（{currentStats.recordCount} 筆紀錄）。
                <br />
                <span className="muted">
                  瀏覽器無法替你確認檔案是否存檔成功，所以這一步只能由你來確認。
                </span>
              </label>
            </div>
          </div>

          <h3>步驟 2：全量取代</h3>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={!safetySaved || !safetyConfirmed || busy}
              onClick={() => void doRestore(stage.backup)}
            >
              {busy ? '取代中…' : '確認全量取代'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage({ kind: 'idle' })
                if (fileRef.current) fileRef.current.value = ''
              }}
            >
              取消（不更動任何資料）
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === 'done' ? (
        <div className="card">
          <h3>還原完成</h3>
          <p>{stage.message}</p>
          <button type="button" onClick={() => setStage({ kind: 'idle' })}>
            關閉
          </button>
        </div>
      ) : null}
    </>
  )
}

function StatsTable({ label, stats }: { label: string; stats: BackupStats }) {
  return (
    <table className="compare">
      <tbody>
        <tr>
          <th>{label}</th>
          <td />
        </tr>
        <tr>
          <th>項目數</th>
          <td>{stats.itemCount}</td>
        </tr>
        <tr>
          <th>紀錄日數</th>
          <td>{stats.dayCount}</td>
        </tr>
        <tr>
          <th>紀錄筆數</th>
          <td>{stats.recordCount}</td>
        </tr>
        <tr>
          <th>日期範圍</th>
          <td>{stats.firstDate ? `${stats.firstDate} ～ ${stats.lastDate}` : '—'}</td>
        </tr>
      </tbody>
    </table>
  )
}

function CompareTable({ current, incoming }: { current: BackupStats; incoming: BackupStats }) {
  const rows: Array<[string, string, string]> = [
    ['項目數', String(current.itemCount), String(incoming.itemCount)],
    ['紀錄日數', String(current.dayCount), String(incoming.dayCount)],
    ['紀錄筆數', String(current.recordCount), String(incoming.recordCount)],
    [
      '日期範圍',
      current.firstDate ? `${current.firstDate} ～ ${current.lastDate}` : '—',
      incoming.firstDate ? `${incoming.firstDate} ～ ${incoming.lastDate}` : '—',
    ],
    [
      '匯出時間',
      '—',
      incoming.exportedAt ? new Date(incoming.exportedAt).toLocaleString('zh-TW') : '—',
    ],
  ]
  return (
    <table className="compare">
      <thead>
        <tr>
          <th />
          <th>目前資料</th>
          <th>傳入資料</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{a}</td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
