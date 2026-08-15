import { APP_VERSION } from '../lib/backup'

export function About() {
  return (
    <section>
      <p>
        <strong>Health Check-in</strong>
      </p>
      <p>app {APP_VERSION}</p>
      <p>build {__BUILD_ID__}</p>
      <p className="muted">
        部署新版後，重開 app 會出現更新提示；按下更新，再回到本頁核對 build
        編號，即可確認已是最新版。
      </p>
    </section>
  )
}
