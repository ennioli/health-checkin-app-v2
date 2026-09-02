import { expect, test, type Page } from '@playwright/test'

/**
 * A backup carrying two versions of the same item: a lenient one from June and
 * a stricter one from late July. The same value (1800 ml) is recorded under
 * each, so the restored history must show 🥇 for the June day and ⊘ for the
 * July day — proving each day is judged by the standard in force *then*.
 */
function historyBackup() {
  const itemId = 'item-water'
  const v1 = 'ver-water-1'
  const v2 = 'ver-water-2'
  const rec = (date: string, value: number, versionId: string) => ({
    key: `${date}|${itemId}`,
    date,
    itemId,
    value,
    notApplicable: false,
    versionId,
    filledAt: `${date}T21:00:00.000Z`,
    updatedAt: `${date}T21:00:00.000Z`,
  })

  return {
    schema_version: 1,
    exported_at: '2026-07-28T10:00:00.000Z',
    app_version: '0.1.0',
    definitions: [
      {
        item: {
          id: itemId,
          category: 'diet',
          name: '飲水量',
          dataType: 'number',
          unit: 'ml',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
        versions: [
          {
            id: v1,
            itemId,
            effectiveFrom: '2026-06-01',
            enabled: true,
            required: true,
            applicableDays: [0, 1, 2, 3, 4, 5, 6],
            scoring: 'tiered',
            direction: 'atLeast',
            bands: [{ badge: 'gold', min: 1500 }],
            createdAt: '2026-06-01T00:00:00.000Z',
          },
          {
            id: v2,
            itemId,
            effectiveFrom: '2026-07-20',
            enabled: true,
            required: true,
            applicableDays: [0, 1, 2, 3, 4, 5, 6],
            scoring: 'tiered',
            direction: 'atLeast',
            bands: [{ badge: 'gold', min: 2500 }],
            createdAt: '2026-07-19T00:00:00.000Z',
          },
        ],
      },
    ],
    settings: { lastBackupAt: null, suggestionSnoozedUntil: {}, onboarded: true },
    records: {
      '2026-06-10': { [itemId]: rec('2026-06-10', 1800, v1) },
      '2026-07-25': { [itemId]: rec('2026-07-25', 1800, v2) },
    },
  }
}

/** Reset, onboard, then open 資料 through the menu — its only entrance now. */
async function resetToDataPage(page: Page) {
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
  await expect(page.locator('.topbar')).toBeVisible()
  await page.getByRole('button', { name: '選單' }).click()
  await page.getByRole('button', { name: /資料（備份・還原）/ }).click()
  await expect(page.getByRole('heading', { name: '從備份還原' })).toBeVisible()
}

async function upload(page: Page, name: string, body: string) {
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(body, 'utf8'),
  })
}

test.describe('restore', () => {
  test('rejects bad payloads whole and leaves data untouched', async ({ page }) => {
    await resetToDataPage(page)
    const currentCard = () =>
      page.locator('.card').filter({ hasText: '目前資料' }).locator('.compare')
    const before = await currentCard().innerText()

    for (const [label, body] of [
      ['malformed.json', '{ this is not json'],
      ['wrong-version.json', JSON.stringify({ ...historyBackup(), schema_version: 99 })],
      [
        'bad-type.json',
        JSON.stringify(
          (() => {
            const b = historyBackup()
            // @ts-expect-error deliberately corrupt
            b.definitions[0].versions[0].enabled = 'yes'
            return b
          })(),
        ),
      ],
      ['missing-definition.json', JSON.stringify({ ...historyBackup(), definitions: [] })],
      [
        'uncovered-date.json',
        JSON.stringify(
          (() => {
            const b = historyBackup()
            b.definitions[0].versions[0].effectiveFrom = '2026-07-01'
            return b // the 2026-06-10 record is now covered by nothing
          })(),
        ),
      ],
    ] as const) {
      await upload(page, label, body)
      await expect(page.getByRole('heading', { name: '已拒絕整份檔案' })).toBeVisible()
      await expect(page.getByText('完全沒有匯入')).toBeVisible()
      expect(await currentCard().innerText()).toBe(before)
      await page.getByRole('button', { name: '關閉' }).click()
    }
  })

  test('will not replace anything until the safety backup is confirmed saved', async ({ page }) => {
    await resetToDataPage(page)
    await upload(page, 'good.json', JSON.stringify(historyBackup()))

    await expect(page.getByRole('heading', { name: '確認還原' })).toBeVisible()
    const confirmCard = page.locator('.card').filter({ hasText: '確認還原' })
    await expect(confirmCard.locator('.compare')).toContainText('傳入資料')

    const confirm = page.getByRole('button', { name: '確認全量取代' })
    const checkbox = page.getByRole('checkbox')
    await expect(confirm).toBeDisabled()
    await expect(checkbox).toBeDisabled()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載目前資料的 safety backup' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^health-checkin-safety-\d{4}-\d{2}-\d{2}\.json$/)

    await expect(confirm).toBeDisabled()
    await checkbox.check()
    await expect(confirm).toBeEnabled()
  })

  test('cancelling changes nothing', async ({ page }) => {
    await resetToDataPage(page)
    const currentCard = page.locator('.card').filter({ hasText: '目前資料' }).locator('.compare')
    const before = await currentCard.innerText()
    await upload(page, 'good.json', JSON.stringify(historyBackup()))
    await page.getByRole('button', { name: /取消（不更動任何資料）/ }).click()
    await expect(page.getByRole('heading', { name: '確認還原' })).toHaveCount(0)
    expect(await currentCard.innerText()).toBe(before)
  })

  test('full replace, then history is judged by the old standards', async ({ page }) => {
    await resetToDataPage(page)
    await upload(page, 'good.json', JSON.stringify(historyBackup()))

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載目前資料的 safety backup' }).click()
    await download
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '確認全量取代' }).click()

    await expect(page.getByRole('heading', { name: '還原完成' })).toBeVisible()
    await expect(page.getByText(/已全量取代:1 個項目、2 天、2 筆紀錄|已全量取代：1 個項目、2 天、2 筆紀錄/)).toBeVisible()

    // Back to the check-in screen; jump straight to the June day.
    await page.getByRole('button', { name: '返回' }).click()
    await page.getByLabel('選擇日期').fill('2026-06-10')
    const row = page.locator('.item-row').filter({ has: page.locator('.name', { hasText: '飲水量' }) })
    await expect(row.getByRole('spinbutton')).toHaveValue('1800')
    await expect(row.locator('.badge')).toHaveText('🥇')

    // Same value, stricter era.
    await page.getByLabel('選擇日期').fill('2026-07-25')
    await expect(row.getByRole('spinbutton')).toHaveValue('1800')
    await expect(row.locator('.badge')).toHaveText('⊘')
  })

  test('a downloaded backup round-trips through restore unchanged', async ({ page }) => {
    await resetToDataPage(page)
    // Record something first so the export carries data.
    await page.getByRole('button', { name: '返回' }).click()
    await page.getByRole('button', { name: '伸展：完全' }).click()
    await page.getByRole('button', { name: '零食甜食 加一' }).click()

    await page.getByRole('button', { name: '選單' }).click()
    await page.getByRole('button', { name: /資料（備份・還原）/ }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載備份 JSON' }).click()
    const file = await download
    const stream = await file.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const exported = Buffer.concat(chunks).toString('utf8')

    const parsed = JSON.parse(exported)
    expect(parsed.schema_version).toBe(1)
    expect(parsed.definitions.length).toBeGreaterThan(0)

    await upload(page, 'roundtrip.json', exported)
    await expect(page.getByRole('heading', { name: '確認還原' })).toBeVisible()
    const safety = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載目前資料的 safety backup' }).click()
    await safety
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '確認全量取代' }).click()
    await expect(page.getByRole('heading', { name: '還原完成' })).toBeVisible()

    await page.getByRole('button', { name: '返回' }).click()
    await expect(page.getByRole('button', { name: '伸展：完全' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      page.locator('.item-row').filter({ has: page.locator('.name', { hasText: '零食甜食' }) }).locator('.count'),
    ).toHaveText('1')
  })
})
