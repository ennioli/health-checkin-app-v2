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
  await page.getByRole('button', { name: '晨間伸展：完全' }).click()
  await page.getByRole('button', { name: '零食＋含糖飲料 加一' }).click()

  await page.getByRole('tab', { name: '近一週' }).click()

  // The summary card lives here, not on the check-in screen.
  const summary = page.locator('section.card').filter({ hasText: '本週摘要' })
  await expect(summary).toBeVisible()
  await expect(summary.locator('.pill.ok')).toContainText('達成 1')
  await expect(summary.locator('.chip').first()).toHaveText('週零食飲料 1/2')
  await expect(summary.locator('.chip').nth(1)).toHaveText('大餐日 0/1')

  // The fitness matrix shows today's gold in today's column.
  const fitness = page.locator('section.card').filter({ hasText: 'strength-cardio-reshape' })
  const stretchRow = fitness.locator('tr').filter({ hasText: '晨間伸展' })
  await expect(stretchRow.locator('.cell-badge')).toHaveText('🥇')

  // Clicking a day column jumps back to that day's check-in.
  const dayOfMonth = String(new Date().getDate())
  await fitness
    .locator('thead th.today-col button')
    .click()
  await expect(page.getByRole('tab', { name: '打卡' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.topbar')).toContainText('今天')
  expect(dayOfMonth).toBeTruthy()
})

test('feast day moves snacks out of the weekly total in the summary', async ({ page }) => {
  await resetAndOnboard(page)

  const plus = page.getByRole('button', { name: '零食＋含糖飲料 加一' })
  await plus.click()
  await plus.click()
  await plus.click()
  await page.getByRole('switch', { name: '大餐日' }).click()

  await page.getByRole('tab', { name: '近一週' }).click()
  const summary = page.locator('section.card').filter({ hasText: '本週摘要' })
  await expect(summary.locator('.chip').first()).toHaveText('週零食飲料 0/2')
  await expect(summary.locator('.chip').nth(1)).toHaveText('大餐日 1/1')
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
  const weightCard = page.locator('section.card').filter({ hasText: 'steady-weight-loss' })
  const bentoRow = weightCard.locator('tr').filter({ hasText: '便當達標' })
  // Yesterday may fall in last week (if today is Monday) — then the cell is
  // not in this week's matrix and the row simply has no badge.
  const isMonday = new Date().getDay() === 1
  if (!isMonday) {
    // Yesterday's cell shows the pick; earlier elapsed days in the week are
    // rightly ✗ (the seeded standard existed and the days went unfilled).
    await expect(bentoRow.locator('.cell-badge', { hasText: '🥉' })).toHaveCount(1)
  }
})
