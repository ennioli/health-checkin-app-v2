# health-checkin-app-v2

每日健康簽到 PWA，v1 風格：一鍵五級打卡（⊘🥉🥈🥇💎）、頂部日期導覽、
打卡／近一週兩檢視、☰ 選單收計畫與資料。六區：血壓（短期觀察）、睡眠、
減重、飲食、健身、心境。Local-first——資料只存在這台裝置的瀏覽器
IndexedDB，靠手動 JSON 備份／還原搬移。

規格來源：`draft/health-checkin-app-redesign.refined.md`
計畫文件：`../kickoff.md`

## 快速開始

```bash
npm install
npm run dev        # http://localhost:5173/health-checkin-app-v2/
```

## 測試

```bash
npm test           # Vitest：判定引擎、版次解析、備份驗證、還原原子性
npm run test:e2e   # Playwright：iPhone(WebKit) + MacBook(Chromium) 真實操作
npm run test:all   # 兩者都跑（部署前的門檻）
```

第一次跑 e2e 需要下載瀏覽器：

```bash
npx playwright install chromium webkit
```

## iPhone 實機測試（PWA 安裝與離線）

iOS 只在**受信任**的憑證下註冊 Service Worker，自簽憑證不夠。用 mkcert：

```bash
brew install mkcert
mkcert -install
mkdir -p certs
# 換成這台 Mac 在區域網路上的 IP
mkcert -key-file certs/dev-key.pem -cert-file certs/dev-cert.pem 192.168.x.x localhost
npm run dev:https
```

然後：

1. 把 `~/Library/Application Support/mkcert/rootCA.pem` 傳到 iPhone（AirDrop），
   安裝描述檔，再到「設定 → 一般 → 關於本機 → 憑證信任設定」把它打開。
2. iPhone Safari 開 `https://192.168.x.x:5173/health-checkin-app-v2/`。
3. 分享 → 加入主畫面。
4. 開飛航模式，從主畫面開啟，確認可以簽到、看紀錄、下載備份。

`certs/` 已在 `.gitignore` 內，不會進版控。

## 部署

推到 `main` 就會觸發 `.github/workflows/deploy-pages.yml`：先跑 Vitest 與
Playwright，全過才建置並發布到 GitHub Pages。

正式網址：`https://ennioli.github.io/health-checkin-app-v2/`

## 資料與隱私

- 個人簽到資料只在瀏覽器 IndexedDB，**不會**進 repo、部署產物或 URL。
- 備份 JSON 請存到這台裝置以外的地方；建議放在私有工作區
  `../data-backup/`（不在此 repo 內）。
- 還原一律**全量取代**：驗證整份檔案 → 顯示現有 vs 傳入比對 → 產生 safety
  backup → 由你明確確認檔案已存檔 → 單一 transaction 取代。任何一步失敗，
  既有資料原封不動。

## 架構重點

| 檔案 | 負責 |
|---|---|
| `src/lib/judge.ts` | 值 → 徽章，以及一天四種狀態的唯一判定處 |
| `src/lib/versions.ts` | 「某日有效的設定」——改標準不動歷史的機制 |
| `src/lib/week.ts` | 週一至週日彙總：零食週上限、大餐日豁免、週摘要 |
| `src/lib/validate.ts` | 備份檔完整驗證，任何問題整份拒絕 |
| `src/lib/db.ts` | IndexedDB；`replaceAll` 在單一 transaction 內全量取代 |
| `src/lib/suggest.ts` | 連續未達時的降低難度提案（只提案，不自動套用） |
| `src/ui/CheckinView.tsx` | 打卡畫面：大類卡＋項目列＋一鍵控制 |
| `src/ui/WeekView.tsx` | 近一週：本週摘要卡＋項目×七天徽章矩陣 |
