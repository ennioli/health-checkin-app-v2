import { expect, test, type Page } from '@playwright/test'
import { dayOffset, openAllCards, openWeek, restoreSeed, seedBackup, seedRecord } from './seed'

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
  await openAllCards(page)
  await page.getByRole('button', { name: /開始使用/ }).click()
  await expect(page.locator('.topbar')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await resetAndOnboard(page)
})

test('one-tap check-in across control types, and it all survives a reload', async ({ page }) => {
  // Five-level one-tap: pick, verify, re-pick clears.
  const stretch = page.getByRole('button', { name: '伸展：完全' })
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
  // both, the untouched side at its default. 早 and 晚 share one row behind a
  // tab — 早 is the one on screen when the page opens.
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveValue('120')
  await expect(page.getByRole('spinbutton', { name: '早 舒張壓' })).toHaveValue('80')
  await expect(page.getByRole('spinbutton', { name: '晚 收縮壓' })).toHaveCount(0)
  await page.getByRole('spinbutton', { name: '早 收縮壓' }).fill('118')

  // Counter.
  const plus = page.getByRole('button', { name: '零食甜食 加一' })
  await plus.click()
  await plus.click()
  await expect(itemRow(page, '零食甜食').locator('.count')).toHaveText('2')

  // Everything survives a reload — IndexedDB is the only copy.
  await page.reload()
  await expect(page.getByRole('button', { name: '伸展：完全' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(itemRow(page, '零食甜食').locator('.count')).toHaveText('2')
  await expect(
    itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' }),
  ).toHaveValue('70.4')
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveValue('118')
  await expect(page.getByRole('spinbutton', { name: '早 舒張壓' })).toHaveValue('80')
  // The evening pair was never touched — still the uncommitted default, and it
  // takes one tab tap to reach it.
  await page.getByRole('button', { name: '切換到 晚' }).click()
  await expect(page.getByRole('spinbutton', { name: '晚 收縮壓' })).toHaveValue('120')
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveCount(0)
})

test('one button swaps 早/晚 blood pressure and flags the hidden one', async ({ page }) => {
  const card = catCard(page, '血壓')
  // One row on screen, and one button — the one naming what you would get.
  await expect(card.locator('.item-row')).toHaveCount(1)
  await expect(card.locator('.field-switch')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '切換到 晚' })).toBeVisible()

  await page.getByRole('spinbutton', { name: '早 收縮壓' }).fill('118')
  await page.getByRole('button', { name: '切換到 晚' }).click()
  await expect(card.locator('.item-row')).toHaveCount(1)
  // Now it offers the way back, and marks 早 as already taken.
  await expect(page.getByRole('button', { name: '切換到 早（已記錄）' })).toBeVisible()

  // The evening reading is stored against its own item, not the morning one.
  await page.getByRole('spinbutton', { name: '晚 舒張壓' }).fill('71')
  await page.getByRole('button', { name: '切換到 早（已記錄）' }).click()
  // The dot moving to 晚 is the signal that the write reached the database.
  await expect(page.getByRole('button', { name: '切換到 晚（已記錄）' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('spinbutton', { name: '早 收縮壓' })).toHaveValue('118')
  await page.getByRole('button', { name: '切換到 晚（已記錄）' }).click()
  await expect(page.getByRole('spinbutton', { name: '晚 舒張壓' })).toHaveValue('71')
})

test('each capped counter gets its own chip, and the feast day exempts today', async ({
  page,
}) => {
  // 零食甜食 and 含糖飲料 are separate weekly contracts — one chip each, or the
  // drink budget would be invisible behind whichever came first.
  const chips = catCard(page, '飲食').locator('.chip')
  const snackChip = chips.filter({ hasText: '零食甜食' })
  const drinkChip = chips.filter({ hasText: '含糖飲料' })
  await expect(snackChip).toHaveText('週零食甜食 0/4')
  await expect(drinkChip).toHaveText('週含糖飲料 0/2')

  const plus = page.getByRole('button', { name: '零食甜食 加一' })
  for (let i = 0; i < 4; i++) await plus.click()
  await expect(snackChip).toHaveText('週零食甜食 4/4')
  await expect(snackChip).not.toHaveClass(/over/)

  // The fifth snack breaches its cap — chip flags it, nothing blocks, and the
  // drink budget is untouched by it.
  await plus.click()
  await expect(snackChip).toHaveText('週零食甜食 5/4')
  await expect(snackChip).toHaveClass(/over/)
  await expect(drinkChip).toHaveText('週含糖飲料 0/2')
  await expect(drinkChip).not.toHaveClass(/over/)

  // The drink counts against its own line only.
  await page.getByRole('button', { name: '含糖飲料 加一' }).click()
  await expect(drinkChip).toHaveText('週含糖飲料 1/2')
  await expect(snackChip).toHaveText('週零食甜食 5/4')

  // Feast day: today's counters stay recorded but leave both contract counts.
  await page.getByRole('switch', { name: '大餐日' }).click()
  await expect(snackChip).toHaveText('週零食甜食 0/4')
  await expect(drinkChip).toHaveText('週含糖飲料 0/2')
  await expect(itemRow(page, '零食甜食').locator('.count')).toHaveText('5')

  // Toggle back off and the counts return.
  await page.getByRole('switch', { name: '大餐日' }).click()
  await expect(snackChip).toHaveText('週零食甜食 5/4')
  await expect(drinkChip).toHaveText('週含糖飲料 1/2')
})

test('晨測體重 and 腰圍 share one row through the same switch', async ({ page }) => {
  // Same rule as the bp pair, reached through a different data type — the two
  // morning tapes are one field with a switch, not two rows.
  const card = catCard(page, '減重')
  await expect(card.locator('.item-row')).toHaveCount(3) // 體重|腰圍, 宵夜截止, 便當達標
  await expect(page.getByRole('spinbutton', { name: '晨測體重' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '腰圍' })).toHaveCount(0)

  // 腰圍 sits fourth in the item list, but the shared slot is the first one —
  // switching must not shove 宵夜截止 and 便當達標 up or down the card.
  const rowNames = () => card.locator('.item-row .name').allTextContents()
  expect(await rowNames()).toEqual(['晨測體重', '宵夜截止', '便當達標'])

  await page.getByRole('button', { name: '切換到 腰圍' }).click()
  await expect(page.getByRole('spinbutton', { name: '腰圍' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: '晨測體重' })).toHaveCount(0)
  expect(await rowNames()).toEqual(['腰圍', '宵夜截止', '便當達標'])

  // Recording through the switch stores against the right item.
  await page.getByRole('spinbutton', { name: '腰圍' }).fill('92')
  await page.getByRole('button', { name: '切換到 晨測體重' }).click()
  await expect(page.getByRole('button', { name: '切換到 腰圍（已記錄）' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('spinbutton', { name: '晨測體重' })).toHaveValue('77.6')
  await page.getByRole('button', { name: '切換到 腰圍（已記錄）' }).click()
  await expect(page.getByRole('spinbutton', { name: '腰圍' })).toHaveValue('92')
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

test('an item restricted to one weekday appears only on that day', async ({ page }) => {
  // Seeded in inches, the unit this item shipped with — an install that
  // predates the switch to cm must be migrated by preset reconciliation, not
  // left measuring in a unit nothing else in the app uses.
  await restoreSeed(
    page,
    seedBackup([
      {
        id: 'it-waist',
        name: '腰圍',
        dataType: 'number',
        unit: '吋',
        presetKey: 'waist',
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
  await expect(itemRow(page, '腰圍').locator('.muted')).toHaveText('cm')

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
  await openWeek(page)
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

  const box = await page.getByRole('button', { name: '伸展：完全' }).boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(40)
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

test('the note field survives IME composition and only writes once it settles', async ({
  page,
}) => {
  // 今日備註 is an optional preset, so onboarding does not create it.
  await restoreSeed(
    page,
    seedBackup([
      {
        id: 'it-note',
        category: 'mind',
        name: '今日備註',
        dataType: 'text',
        presetKey: 'note',
        scoring: 'none',
        required: false,
      },
    ]),
  )

  const note = page.getByRole('textbox', { name: '今日備註' })
  await expect(note).toHaveValue('')

  // Reads the note straight out of IndexedDB — the only way to tell "the draft
  // is on screen" from "the draft has been committed".
  const stored = () =>
    page.evaluate(async () => {
      const rows: Array<{ itemId: string; value: unknown }> = await new Promise((resolve) => {
        const req = indexedDB.open('health-checkin-v2')
        req.onsuccess = () => {
          const db = req.result
          const all = db.transaction('records').objectStore('records').getAll()
          all.onsuccess = () => resolve(all.result)
          all.onerror = () => resolve([])
        }
        req.onerror = () => resolve([])
      })
      const items: Array<{ id: string; presetKey?: string }> = await new Promise((resolve) => {
        const req = indexedDB.open('health-checkin-v2')
        req.onsuccess = () => {
          const all = req.result.transaction('items').objectStore('items').getAll()
          all.onsuccess = () => resolve(all.result)
          all.onerror = () => resolve([])
        }
        req.onerror = () => resolve([])
      })
      const id = items.find((i) => i.presetKey === 'note')?.id
      return rows.find((r) => r.itemId === id)?.value ?? null
    })

  // The Pinyin keyboard: latin letters land in the element while the IME holds
  // an unconfirmed buffer, and only compositionend produces the characters.
  const compose = (phase: 'start' | 'update' | 'end', text: string) =>
    page.evaluate(
      ([phase, text]) => {
        const el = document.querySelector('textarea[aria-label="今日備註"]') as HTMLTextAreaElement
        const native = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )!.set!
        if (phase === 'start') el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        native.call(el, text)
        el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: phase !== 'end' }))
        if (phase === 'end')
          el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }))
      },
      [phase, text] as const,
    )

  await note.focus()
  await compose('start', 'ni')
  await compose('update', 'nihao')
  await expect(note).toHaveValue('nihao')

  // Well past the commit window: a mid-composition write is what clobbered the
  // IME buffer on iOS, so there must be nothing in the database yet.
  await page.waitForTimeout(1000)
  await expect(note).toHaveValue('nihao')
  expect(await stored()).toBeNull()

  // Picking the candidate replaces the buffer, and that is what gets written.
  await compose('end', '你好')
  await expect(note).toHaveValue('你好')
  await expect.poll(stored).toBe('你好')

  // Plain typing still commits, and blur flushes without waiting for the pause.
  await note.fill('你好嗎')
  await note.blur()
  await expect.poll(stored).toBe('你好嗎')

  await page.reload()
  await expect(page.getByRole('textbox', { name: '今日備註' })).toHaveValue('你好嗎')
})

test('a number field opens on the value it last carried, not the preset default', async ({
  page,
}) => {
  // Yesterday's weight, seeded through the real restore path so the item's
  // standard already existed then.
  const itemId = 'it-weight'
  const yesterday = dayOffset(1)
  await restoreSeed(
    page,
    seedBackup(
      [
        {
          id: itemId,
          category: 'weight',
          name: '晨測體重',
          dataType: 'number',
          unit: 'kg',
          presetKey: 'weight_morning',
          scoring: 'recorded',
        },
      ],
      { [yesterday]: { [itemId]: seedRecord(itemId, yesterday, 76.4) } },
    ),
  )

  // Today opens on 76.4 — muted, so it is still a suggestion and not a record.
  const field = itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' })
  await expect(field).toHaveValue('76.4')
  await expect(field).toHaveAttribute('style', /--muted/)

  // The steppers still move in 0.1 kg — step follows the preset default, not
  // whatever happened to be recorded last.
  await itemRow(page, '晨測體重').getByRole('button', { name: '晨測體重 增加' }).click()
  await expect(field).toHaveValue('76.5')

  // Nothing was carried into the record until that tap: yesterday is untouched.
  await page.getByRole('button', { name: '前一天' }).click()
  await expect(
    itemRow(page, '晨測體重').getByRole('spinbutton', { name: '晨測體重' }),
  ).toHaveValue('76.4')
})

test('the week matrix marks days an item does not apply to', async ({ page }) => {
  await restoreSeed(
    page,
    seedBackup([
      {
        id: 'it-waist2',
        category: 'weight',
        name: '腰圍',
        dataType: 'number',
        unit: 'cm',
        presetKey: 'waist',
        scoring: 'recorded',
        required: false,
        applicableDays: [0],
      },
    ]),
  )

  await openWeek(page)
  const row = page.locator('tr', { has: page.locator('.item-name-cell', { hasText: '腰圍' }) })
  // Six of the seven columns are "不適用", matching the legend — a blank cell
  // read as six missed days instead of one applicable one.
  await expect(row.locator('td', { hasText: '—' })).toHaveCount(6)
})

test('cards fold to the clock, and a tap overrides it until the day turns', async ({ page }) => {
  const card = (label: string) => catCard(page, label)
  const open = (label: string) => card(label).locator('.cat-toggle')

  // The clock→bucket→defaults mapping is pinned in src/lib/collapse.test.ts.
  // What matters here is that it reaches the DOM, so the expectation is derived
  // the same way the app derives it — from the BROWSER's clock, which is not
  // always the runner's: WebKit ignores a TZ set on the node process, and the
  // app naturally answers to the clock the user is looking at.
  const hour = await page.evaluate(() => new Date().getHours())
  const morning = hour >= 4 && hour < 12
  const folded = morning ? ['飲食', '健身'] : ['睡眠']
  const openCards = morning ? ['睡眠'] : ['飲食', '健身']

  await page.evaluate(() => localStorage.removeItem('checkin-collapse-v1'))
  await page.reload()
  for (const label of folded) {
    await expect(open(label)).toHaveAttribute('aria-expanded', 'false')
    await expect(card(label).locator('.item-row')).toHaveCount(0)
  }
  for (const label of openCards) {
    await expect(open(label)).toHaveAttribute('aria-expanded', 'true')
  }

  // 血壓, 減重 and 心境 are never folded by the clock.
  for (const label of ['血壓', '減重', '心境']) {
    await expect(open(label)).toHaveAttribute('aria-expanded', 'true')
  }

  // A shut card still reports — the weekly chips stay on its header.
  await expect(catCard(page, '飲食').locator('.chip').first()).toBeVisible()

  // A tap wins over the clock, in both directions, and survives a reload.
  const shut = folded[0]
  await open(shut).click()
  await expect(card(shut).locator('.item-row').first()).toBeVisible()
  await open(openCards[0]).click()
  await expect(card(openCards[0]).locator('.item-row')).toHaveCount(0)

  await page.reload()
  await expect(open(shut)).toHaveAttribute('aria-expanded', 'true')
  await expect(open(openCards[0])).toHaveAttribute('aria-expanded', 'false')

  // A stored preference from another day is discarded, not carried forward.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('checkin-collapse-v1')!)
    localStorage.setItem('checkin-collapse-v1', JSON.stringify({ ...raw, date: '2020-01-01' }))
  })
  await page.reload()
  await expect(open(shut)).toHaveAttribute('aria-expanded', 'false')
})
