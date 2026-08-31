import { expect, test, type Page } from '@playwright/test'
import { restoreSeed, seedBackup } from './seed'

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

test('week view: summary card on top, badge matrix below, day columns navigate', async ({
  page,
}) => {
  await resetAndOnboard(page)

  // Make today distinctive: one gold, one snack.
  await page.getByRole('button', { name: '伸展：完全' }).click()
  await page.getByRole('button', { name: '零食甜食 加一' }).click()

  await page.getByRole('tab', { name: '近一週' }).click()

  // One single card: summary pills on top, ONE table with category header
  // rows spanning the width.
  const card = page.locator('section.card').filter({ hasText: '近一週' })
  await expect(card).toBeVisible()
  await expect(card.locator('table')).toHaveCount(1)
  await expect(card.locator('.week-cat-row')).toHaveCount(6) // 六大區
  await expect(card.locator('.pill.ok')).toContainText('達成 1')
  await expect(card.locator('.chip').filter({ hasText: '零食甜食' })).toHaveText('週零食甜食 1/4')
  await expect(card.locator('.chip').filter({ hasText: '含糖飲料' })).toHaveText('週含糖飲料 0/2')
  await expect(card.locator('.chip').filter({ hasText: '大餐日' })).toHaveText('大餐日 0/1')

  // Today's gold shows in the stretch row; today is the highlighted last column.
  const stretchRow = card.locator('tr').filter({ hasText: '伸展' })
  await expect(stretchRow.locator('.cell-badge')).toHaveText('🥇')
  await expect(card.locator('thead th.sel-col')).toHaveCount(1)

  // Clicking a day column jumps back to that day's check-in.
  await card.locator('thead th.today-col button').click()
  await expect(page.getByRole('tab', { name: '打卡' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.topbar')).toContainText('今天')
})

test('feast day moves snacks out of the weekly total in the summary', async ({ page }) => {
  await resetAndOnboard(page)

  const plus = page.getByRole('button', { name: '零食甜食 加一' })
  await plus.click()
  await plus.click()
  await plus.click()
  await page.getByRole('switch', { name: '大餐日' }).click()

  await page.getByRole('tab', { name: '近一週' }).click()
  const card = page.locator('section.card').filter({ hasText: '近一週' })
  await expect(card.locator('.chip').filter({ hasText: '零食甜食' })).toHaveText('週零食甜食 0/4')
  await expect(card.locator('.chip').filter({ hasText: '大餐日' })).toHaveText('大餐日 1/1')
})

test('the week matrix keeps history judged by the standard of its own day', async ({ page }) => {
  // Seeded so the standard already covered yesterday (onboarding versions
  // deliberately start today).
  await restoreSeed(page, seedBackup([{ id: 'it-bento', name: '便當達標', category: 'weight' }]))

  // Yesterday: fill a five-level pick.
  await page.getByRole('button', { name: '前一天' }).click()
  await page.getByRole('button', { name: '便當達標：部分' }).click()
  await page.getByRole('button', { name: '今天' }).click()

  await page.getByRole('tab', { name: '近一週' }).click()
  // The rolling window always ends on the selected date, so yesterday is
  // always visible — no Monday special case anymore.
  const bentoRow = page.locator('tr').filter({ hasText: '便當達標' })
  await expect(bentoRow.locator('.cell-badge', { hasText: '🥉' })).toHaveCount(1)
})
