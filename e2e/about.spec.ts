import { expect, test } from '@playwright/test'

/** 關於 must show a real build stamp — a 'dev' fallback in the built bundle
 * means the CI build lost sight of the git SHA and the page can no longer
 * prove which version is running. */
test('the about page shows the app version and a real build stamp', async ({ page }) => {
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
  await page.getByRole('button', { name: /關於（版本）/ }).click()

  await expect(page.getByRole('heading', { name: '關於' })).toBeVisible()
  await expect(page.getByText(/^app \d+\.\d+\.\d+$/)).toBeVisible()
  await expect(page.getByText(/^build [0-9a-f]{7,}・\d{4}-\d{2}-\d{2}$/)).toBeVisible()

  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByRole('tab', { name: '打卡' })).toBeVisible()
})
