import { expect, test, type Page } from '@playwright/test'
import { restoreSeed, seedBackup } from './seed'

function catCard(page: Page, label: string) {
  return page.locator('section.card').filter({
    has: page.locator('.cat-name', { hasText: label }),
  })
}

function itemRow(page: Page, name: string) {
  return page.locator('.item-row').filter({
    has: page.locator('.name', { hasText: name }),
  })
}

async function resetAndOnboard(page: Page) {
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
}

test.beforeEach(async ({ page }) => {
  await resetAndOnboard(page)
})

test('one-tap check-in across control types, and it all survives a reload', async ({ page }) => {
  // Five-level one-tap: pick, verify, re-pick clears.
  const stretch = page.getByRole('button', { name: '晨間伸展：完全' })
  await stretch.click()
  await expect(stretch).toHaveAttribute('aria-pressed', 'true')
  await stretch.click()
  await expect(stretch).toHaveAttribute('aria-pressed', 'false')
  await stretch.click()

  // ⊘ is a real pick — filled-but-missed, not unfilled.
  await page.getByRole('button', { name: '棋類宵禁：未達' }).click()
  await expect(page.getByRole('button', { name: '棋類宵禁：未達' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // 冥想 is badge-scored like the rest of the one-tap items.
  await page.getByRole('button', { name: '冥想：大致' }).click()
  await expect(page.getByRole('button', { name: '冥想：大致' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Numbers: weight starts at its muted default and records on change.
  const weightInput = itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' })
  await expect(weightInput).toHaveValue('77.6')
  await weightInput.fill('70.4')

  // Blood pressure shows 120/80 as its default; editing one side commits
  // both, the untouched side at its default.
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveValue('120')
  await expect(page.getByRole('spinbutton', { name: '早 舒張壓' })).toHaveValue('80')
  await page.getByRole('spinbutton', { name: '早 收縮壓' }).fill('118')

  // Counter.
  const plus = page.getByRole('button', { name: '零食＋含糖飲料 加一' })
  await plus.click()
  await plus.click()
  await expect(itemRow(page, '零食＋含糖飲料').locator('.count')).toHaveText('2')

  // Everything survives a reload — IndexedDB is the only copy.
  await page.reload()
  await expect(page.getByRole('button', { name: '晨間伸展：完全' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(itemRow(page, '零食＋含糖飲料').locator('.count')).toHaveText('2')
  await expect(
    itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' }),
  ).toHaveValue('70.4')
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveValue('118')
  await expect(page.getByRole('spinbutton', { name: '早 舒張壓' })).toHaveValue('80')
  // The evening pair was never touched — still the uncommitted default.
  await expect(page.getByRole('spinbutton', { name: '晚 收縮壓' })).toHaveValue('120')
})

test('snack cap chip counts the week and the feast day exempts today', async ({ page }) => {
  const chip = catCard(page, '飲食').locator('.chip')
  await expect(chip).toHaveText('週零食飲料 0/2')

  const plus = page.getByRole('button', { name: '零食＋含糖飲料 加一' })
  await plus.click()
  await plus.click()
  await expect(chip).toHaveText('週零食飲料 2/2')
  await expect(chip).not.toHaveClass(/over/)

  // Third snack breaches the cap — chip flags it, nothing blocks.
  await plus.click()
  await expect(chip).toHaveText('週零食飲料 3/2')
  await expect(chip).toHaveClass(/over/)

  // Feast day: today's snacks stay recorded but leave the contract count.
  await page.getByRole('switch', { name: '大餐日' }).click()
  await expect(chip).toHaveText('週零食飲料 0/2')
  await expect(itemRow(page, '零食＋含糖飲料').locator('.count')).toHaveText('3')

  // Toggle back off and the count returns.
  await page.getByRole('switch', { name: '大餐日' }).click()
  await expect(chip).toHaveText('週零食飲料 3/2')
})

test('back-fill through the date navigation, same screen', async ({ page }) => {
  // Onboarding versions take effect today, so back-fill needs an item whose
  // standard already existed yesterday — seeded through the real restore UI.
  await restoreSeed(page, seedBackup([{ id: 'it-cutoff', name: '宵夜截止' }]))

  await page.getByRole('button', { name: '前一天' }).click()
  await expect(page.getByRole('button', { name: '今天' })).toBeVisible()

  // Yesterday's pick sticks to yesterday.
  await page.getByRole('button', { name: '宵夜截止：大致' }).click()
  await page.getByRole('button', { name: '今天' }).click()
  await expect(page.getByRole('button', { name: '宵夜截止：大致' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.getByRole('button', { name: '前一天' }).click()
  await expect(page.getByRole('button', { name: '宵夜截止：大致' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // The future is unreachable.
  await page.getByRole('button', { name: '今天' }).click()
  await expect(page.getByRole('button', { name: '後一天' })).toBeDisabled()
})

test('waist appears only on its applicable day (Sunday by default)', async ({ page }) => {
  await restoreSeed(
    page,
    seedBackup([
      {
        id: 'it-waist',
        name: '腰圍',
        dataType: 'number',
        unit: '吋',
        scoring: 'recorded',
        required: false,
        applicableDays: [0],
      },
    ]),
  )

  const todayDow = new Date().getDay()
  await expect(itemRow(page, '腰圍')).toHaveCount(todayDow === 0 ? 1 : 0)

  // Jump to the most recent Sunday via the date picker — the row appears.
  const d = new Date()
  d.setDate(d.getDate() - todayDow)
  const sunday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  await page.getByLabel('選擇日期').fill(sunday)
  await expect(itemRow(page, '腰圍')).toHaveCount(1)

  // And a Saturday shows nothing.
  const sat = new Date(d)
  sat.setDate(sat.getDate() - 1)
  const saturday = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`
  await page.getByLabel('選擇日期').fill(saturday)
  await expect(itemRow(page, '腰圍')).toHaveCount(0)
})

test('an install predating a preset change picks up its new shape on load', async ({ page }) => {
  // 冥想 as it was stored before it became a five-level pick: a yes/no answer
  // with an answer→badge map. Nothing but a reload should be needed to fix it.
  await restoreSeed(
    page,
    seedBackup([
      {
        id: 'it-med',
        category: 'mind',
        name: '冥想 2 分鐘',
        dataType: 'boolean',
        presetKey: 'meditation',
        choiceMap: { yes: 'gold', no: 'miss' },
      },
    ]),
  )

  await expect(page.getByRole('button', { name: '冥想 2 分鐘：有做到' })).toHaveCount(0)
  await expect(itemRow(page, '冥想').locator('.hint')).toHaveText('≥ 2 分鐘')

  // The badge actually judges — a stale choiceMap would score every pick as ⊘.
  const gold = page.getByRole('button', { name: '冥想：完全' })
  await gold.click()
  await expect(gold).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('tab', { name: '近一週' }).click()
  await expect(page.locator('.pill.ok')).toHaveText('達成 1')

  // The fix was written to the database, not just painted on this render.
  await page.reload()
  await expect(page.getByRole('button', { name: '冥想：完全' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a custom banded item added from the menu shows its computed badge', async ({ page }) => {
  await page.getByRole('button', { name: '選單' }).click()
  await page.getByRole('button', { name: /計畫（項目與標準）/ }).click()
  await page.getByRole('button', { name: '＋ 自訂項目' }).click()

  await page.getByLabel('名稱').fill('伸展 5 分鐘')
  await page.getByLabel('大類').selectOption('fitness')
  await page.getByLabel('資料型態').selectOption('duration')
  await page.getByLabel('單位（可留空）').fill('分鐘')
  await page.getByLabel('gold 門檻').fill('5')
  await page.getByRole('button', { name: '新增', exact: true }).click()

  await page.getByRole('button', { name: '返回' }).click()
  const row = itemRow(page, '伸展 5 分鐘')
  await row.getByRole('spinbutton', { name: '伸展 5 分鐘' }).fill('6')
  await expect(row.locator('.badge')).toHaveText('🥇')
  await row.getByRole('spinbutton', { name: '伸展 5 分鐘' }).fill('2')
  await expect(row.locator('.badge')).toHaveText('⊘')
})

test('steppers adjust and commit from the muted default', async ({ page }) => {
  // One tap on ▼ turns the uncommitted 77.6 into a recorded 77.5.
  await page.getByRole('button', { name: '晨測體重 減少' }).click()
  await expect(itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' })).toHaveValue(
    '77.5',
  )

  // Stepping one BP side commits both, the other side at its default.
  await page.getByRole('button', { name: '早 舒張壓 增加' }).click()
  await expect(page.getByRole('spinbutton', { name: '早 舒張壓' })).toHaveValue('81')
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveValue('120')

  await page.reload()
  await expect(itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' })).toHaveValue(
    '77.5',
  )
  await expect(page.getByRole('spinbutton', { name: '早 舒張壓' })).toHaveValue('81')
})

test('no horizontal scrolling at 320px and thumb-sized targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  const box = await page.getByRole('button', { name: '晨間伸展：完全' }).boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(40)
  expect(box!.height).toBeGreaterThanOrEqual(44)
})
