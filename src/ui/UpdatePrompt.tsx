import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * A waiting service worker is never activated behind the user's back — doing
 * so mid-check-in could discard input they have not saved yet. Instead the
 * update sits there until they choose the moment.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="banner warn">
      <div className="row-between">
        <span>有新版本可用。要現在更新嗎？未送出的輸入會保留到你按下更新為止。</span>
        <span className="row">
          <button type="button" className="small primary" onClick={() => void updateServiceWorker(true)}>
            更新
          </button>
          <button type="button" className="small ghost" onClick={() => setNeedRefresh(false)}>
            稍後
          </button>
        </span>
      </div>
    </div>
  )
}
