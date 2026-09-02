import { expect, type Page } from '@playwright/test'

export function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface SeedItem {
  id: string
  name: string
  category?: string
  dataType?: string
  unit?: string
  scoring?: string
  required?: boolean
  applicableDays?: number[]
  bands?: Array<{ badge: string; min?: number | string; max?: number | string }>
  direction?: string
  /** Marks the item as preset-backed, so preset reconciliation can see it. */
  presetKey?: string
  choiceMap?: Record<string, string>
}

/**
 * A minimal valid backup whose items took effect 60 days ago — the only way a
 * test can exercise back-fill, because onboarding correctly refuses to invent
 * standards for days before an item existed.
 */
export function seedBackup(items: SeedItem[], records: Record<string, Record<string, unknown>> = {}) {
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    app_version: '0.1.0',
    definitions: items.map((it) => ({
      item: {
        id: it.id,
        category: it.category ?? 'weight',
        name: it.name,
        dataType: it.dataType ?? 'fiveLevel',
        unit: it.unit,
        createdAt: `${dayOffset(60)}T00:00:00.000Z`,
        presetKey: it.presetKey,
      },
      versions: [
        {
          id: `ver-${it.id}`,
          itemId: it.id,
          effectiveFrom: dayOffset(60),
          enabled: true,
          required: it.required ?? true,
          applicableDays: it.applicableDays ?? [0, 1, 2, 3, 4, 5, 6],
          scoring: it.scoring ?? 'tiered',
          direction: it.direction,
          bands: it.bands,
          choiceMap: it.choiceMap,
          createdAt: `${dayOffset(60)}T00:00:00.000Z`,
        },
      ],
    })),
    settings: { lastBackupAt: new Date().toISOString(), suggestionSnoozedUntil: {}, onboarded: true },
    records,
  }
}

export function seedRecord(itemId: string, date: string, value: unknown) {
  return {
    key: `${date}|${itemId}`,
    date,
    itemId,
    value,
    notApplicable: false,
    versionId: `ver-${itemId}`,
    filledAt: `${date}T21:00:00.000Z`,
    updatedAt: `${date}T21:00:00.000Z`,
  }
}

/**
 * Pin every category card open before the check-in screen first mounts.
 *
 * The card layout answers to the clock — 飲食/健身 fold before noon, 睡眠 after
 * — so without this every test that taps a row would pass or fail depending on
 * the hour it ran. The fold has its own tests, which clear this first.
 */
export async function openAllCards(page: Page) {
  await page.evaluate(() => {
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    localStorage.setItem(
      'checkin-collapse-v1',
      JSON.stringify({
        date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
        bucket: now.getHours() >= 4 && now.getHours() < 12 ? 'morning' : 'rest',
        overrides: { bp: false, sleep: false, weight: false, diet: false, fitness: false, mind: false },
      }),
    )
  })
}

/**
 * Full-replace the app's data with the seed through the real restore UI.
 * No manual DB wipe: restore IS the wipe, and deleteDatabase from a page
 * that holds an open connection just blocks (flaky on WebKit).
 */
export async function restoreSeed(page: Page, payload: unknown) {
  await page.goto('./')
  await openAllCards(page)
  const onboard = page.getByRole('button', { name: /開始使用/ })
  const tab = page.getByRole('tab', { name: '打卡' })
  // Fresh contexts land on onboarding; already-onboarded ones on the app.
  await expect(onboard.or(tab).first()).toBeVisible()
  if (await onboard.isVisible()) await onboard.click()
  await expect(tab).toBeVisible()
  await page.getByRole('button', { name: '選單' }).click()
  await page.getByRole('button', { name: /資料（備份・還原）/ }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'seed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload), 'utf8'),
  })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下載目前資料的 safety backup' }).click()
  await download
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: '確認全量取代' }).click()
  await expect(page.getByRole('heading', { name: '還原完成' })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
}
