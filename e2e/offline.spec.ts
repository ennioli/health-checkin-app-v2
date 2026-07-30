import { expect, test } from '@playwright/test'

// Playwright's WebKit build errors out on reload under offline emulation with
// a service worker registered, so this runs on Chromium. Real Safari/iOS
// offline behaviour is verified on the device itself — see README.
test.skip(
  ({ browserName }) => browserName === 'webkit',
  'WebKit offline emulation + service worker is unreliable in Playwright',
)

/**
 * Exercises the service worker under the GitHub Pages subpath. Passing on a
 * dev origin proves nothing about production, but this build is served from
 * /health-checkin-app-v2/ exactly as Pages will serve it, so a scope or base
 * path mismatch shows up here rather than on the phone.
 */
test('installed shell keeps working with the network cut', async ({ page, context }) => {
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
  // Let setup finish writing before the network is pulled, otherwise the
  // reload can land on a half-written database rather than an offline failure.
  await expect(page.getByRole('tab', { name: '打卡' })).toBeVisible()

  // Wait for the service worker to take control and finish precaching.
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.scope
  })
  expect(scope).toContain('/health-checkin-app-v2/')

  await context.setOffline(true)
  await page.reload()

  // The app shell still boots...
  await expect(page.getByRole('tab', { name: '打卡' })).toBeVisible()

  // ...and a check-in still writes and judges locally.
  const stretch = page.getByRole('button', { name: '伸展：完全' })
  await stretch.click()
  await expect(stretch).toHaveAttribute('aria-pressed', 'true')

  // A backup can still be produced with no network at all.
  await page.getByRole('button', { name: '選單' }).click()
  await page.getByRole('button', { name: /資料（備份・還原）/ }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下載備份 JSON' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^health-checkin-backup-\d{4}-\d{2}-\d{2}\.json$/)

  await context.setOffline(false)
})
