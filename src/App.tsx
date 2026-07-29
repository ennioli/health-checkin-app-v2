import { useState } from 'react'
import { addDays, formatDateHuman, today } from './lib/dates'
import { useStore } from './store'
import { CheckinView } from './ui/CheckinView'
import { DataPage } from './ui/DataPage'
import { Onboarding } from './ui/Onboarding'
import { Plan } from './ui/Plan'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { WeekView } from './ui/WeekView'

type View = 'checkin' | 'week'
type SubPage = 'plan' | 'data' | null

export default function App() {
  const store = useStore()
  const [date, setDate] = useState(today())
  const [view, setView] = useState<View>('checkin')
  const [menuOpen, setMenuOpen] = useState(false)
  const [subPage, setSubPage] = useState<SubPage>(null)

  if (store.loading) {
    return (
      <div className="app">
        <main className="main">
          <p className="muted">載入中…</p>
        </main>
      </div>
    )
  }

  const needsOnboarding = !store.snapshot.settings.onboarded && store.snapshot.items.length === 0
  if (needsOnboarding) {
    return (
      <div className="app">
        <main className="main">
          <UpdatePrompt />
          <Onboarding store={store} />
        </main>
      </div>
    )
  }

  const todayKey = today()
  const isToday = date === todayKey

  const openSubPage = (page: SubPage) => {
    setSubPage(page)
    setMenuOpen(false)
  }

  // 計畫 / 資料 are full sub-pages reached from the menu — never on the main
  // screen, per the owner's call.
  if (subPage) {
    return (
      <div className="app">
        <main className="main">
          <div className="subpage-head">
            <button type="button" aria-label="返回" onClick={() => setSubPage(null)}>
              ← 返回
            </button>
            <h1>{subPage === 'plan' ? '計畫' : '資料'}</h1>
          </div>
          {subPage === 'plan' ? <Plan store={store} /> : <DataPage store={store} />}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <main className="main">
        <UpdatePrompt />

        <header className="topbar">
          <button
            type="button"
            className="nav-arrow"
            aria-label="前一天"
            onClick={() => setDate(addDays(date, -1))}
          >
            ‹
          </button>
          <div className="date-main" style={{ position: 'relative' }}>
            <strong>{date.replaceAll('-', '/')}</strong>
            <span className="muted">
              {formatDateHuman(date).split(' ')[1]}
              {isToday ? '・今天' : ''}
            </span>
            {/* Invisible native picker over the date text: tap to jump. */}
            <input
              type="date"
              aria-label="選擇日期"
              value={date}
              max={todayKey}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                width: '100%',
                height: '100%',
                minHeight: 0,
              }}
            />
          </div>
          {!isToday ? (
            <button type="button" className="today-link active" onClick={() => setDate(todayKey)}>
              今天
            </button>
          ) : null}
          <button
            type="button"
            className="nav-arrow"
            aria-label="後一天"
            disabled={date >= todayKey}
            onClick={() => setDate(addDays(date, 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="nav-arrow"
            aria-label="選單"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
        </header>

        <div className="segmented" role="tablist" aria-label="檢視切換">
          <button
            type="button"
            role="tab"
            aria-pressed={view === 'checkin'}
            aria-selected={view === 'checkin'}
            onClick={() => setView('checkin')}
          >
            打卡
          </button>
          <button
            type="button"
            role="tab"
            aria-pressed={view === 'week'}
            aria-selected={view === 'week'}
            onClick={() => setView('week')}
          >
            近一週
          </button>
        </div>

        {view === 'checkin' ? (
          <CheckinView store={store} date={date} onOpenData={() => openSubPage('data')} />
        ) : (
          <WeekView
            store={store}
            date={date}
            onPickDate={(d) => {
              setDate(d)
              setView('checkin')
            }}
          />
        )}
      </main>

      {menuOpen ? (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <nav className="drawer" aria-label="選單">
            <div className="row-between">
              <strong>選單</strong>
              <button type="button" className="small ghost" aria-label="關閉選單" onClick={() => setMenuOpen(false)}>
                ✕
              </button>
            </div>
            <button type="button" className="menu-item" onClick={() => openSubPage('plan')}>
              🎯 計畫（項目與標準）
            </button>
            <button type="button" className="menu-item" onClick={() => openSubPage('data')}>
              💾 資料（備份・還原）
            </button>
            <p className="menu-note">
              資料只存在這台裝置的瀏覽器。
              {store.snapshot.settings.lastBackupAt
                ? `最近備份：${new Date(store.snapshot.settings.lastBackupAt).toLocaleDateString('zh-TW')}`
                : '尚未備份過。'}
            </p>
          </nav>
        </>
      ) : null}
    </div>
  )
}
