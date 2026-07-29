import { expect, test, type Page } from '@playwright/test'

function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * A history where the last three applicable days were missed and the four
 * before them were fine — exactly the shape that should trigger an offer to
 * make the item easier. Dates are relative so this does not rot.
 */
function strugglingBackup() {
  const itemId = 'item-water'
  const versionId = 'ver-water-1'
  const records: Record<string, unknown> = {}
  const add = (date: string, value: number) => {
    records[date] = {
      [itemId]: {
        key: `${date}|${itemId}`,
        date,
        itemId,
        value,
        notApplicable: false,
        versionId,
        filledAt: `${date}T21:00:00.000Z`,
        updatedAt: `${date}T21:00:00.000Z`,
      },
    }
  }
  for (const back of [1, 2, 3]) add(dayOffset(back), 300) // missed
  for (const back of [4, 5, 6, 7]) add(dayOffset(back), 2000) // fine

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    app_version: '0.1.0',
    definitions: [
      {
        item: {
          id: itemId,
          category: 'diet',
          name: '飲水量',
          dataType: 'number',
          unit: 'ml',
          createdAt: `${dayOffset(60)}T00:00:00.000Z`,
        },
        versions: [
          {
            id: versionId,
            itemId,
            effectiveFrom: dayOffset(60),
            enabled: true,
            required: true,
            applicableDays: [0, 1, 2, 3, 4, 5, 6],
            scoring: 'tiered',
            direction: 'atLeast',
            bands: [{ badge: 'gold', min: 1500 }],
            createdAt: `${dayOffset(60)}T00:00:00.000Z`,
          },
        ],
      },
    ],
    settings: { lastBackupAt: new Date().toISOString(), suggestionSnoozedUntil: {}, onboarded: true },
    records,
  }
}

async function restoreInto(page: Page, payload: unknown) {
  await page.goto('./')
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('health-checkin-v2')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })
  await page.goto('./')
  await page.getByRole('button', { name: /開始使用/ }).click()
  await expect(page.getByRole('tab', { name: '打卡' })).toBeVisible()
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

test('offers to lower the bar after repeated misses, and changes nothing on its own', async ({
  page,
}) => {
  await restoreInto(page, strugglingBackup())

  const suggestion = page.locator('.banner', { hasText: '飲水量' })
  await expect(suggestion).toContainText('最近 7 個適用日裡有 3 天沒達成')
  await expect(suggestion).toContainText('這裡不會自動改')

  // All four escape routes are offered, not just "try harder".
  for (const label of ['降低門檻', '減少頻率', '改變方法', '暫停此項', '維持現狀']) {
    await expect(suggestion.getByRole('button', { name: label })).toBeVisible()
  }

  // Opening the proposal pre-fills an easier threshold...
  await suggestion.getByRole('button', { name: '降低門檻' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('降低門檻：飲水量')
  await expect(dialog.getByLabel('完全 下限')).toHaveValue('1200')

  // ...but backing out leaves the plan exactly as it was.
  await dialog.getByRole('button', { name: '取消' }).click()
  await page.getByRole('button', { name: '選單' }).click()
  await page.getByRole('button', { name: /計畫（項目與標準）/ }).click()
  const planCard = page.locator('.card').filter({ has: page.getByText('飲水量', { exact: true }) })
  await expect(planCard).toContainText('🥇 ≥ 1500ml')
})

test('dismissing the suggestion silences it without touching the plan', async ({ page }) => {
  await restoreInto(page, strugglingBackup())

  const suggestion = page.locator('.banner', { hasText: '飲水量' })
  await suggestion.getByRole('button', { name: '維持現狀' }).click()
  await expect(page.locator('.banner', { hasText: '飲水量' })).toHaveCount(0)

  await page.getByRole('button', { name: '選單' }).click()
  await page.getByRole('button', { name: /計畫（項目與標準）/ }).click()
  const planCard = page.locator('.card').filter({ has: page.getByText('飲水量', { exact: true }) })
  await expect(planCard).toContainText('🥇 ≥ 1500ml')
})

test('accepting the proposal only affects days from the effective date on', async ({ page }) => {
  await restoreInto(page, strugglingBackup())

  const yesterday = dayOffset(1)
  await page.locator('.banner', { hasText: '飲水量' }).getByRole('button', { name: '降低門檻' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '儲存為新版次' }).click()

  // Today now judges 1300 ml as a pass under the eased standard.
  const row = page.locator('.item-row').filter({ has: page.locator('.name', { hasText: '飲水量' }) })
  await row.getByRole('spinbutton').fill('1300')
  await expect(row.locator('.badge')).toHaveText('🥇')

  // Yesterday's 300 ml still fails against the standard in force back then.
  await page.getByLabel('選擇日期').fill(yesterday)
  await expect(row.getByRole('spinbutton')).toHaveValue('300')
  await expect(row.locator('.badge')).toHaveText('⊘')
})
