import { expect, test } from '@playwright/test'

test('owner dashboard screen two renders executive widgets', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('owner')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.getByRole('tab', { name: '2' }).click()

  await expect(page.getByRole('heading', { name: 'Воронка продаж' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Доход и финрезультат' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Пульс бизнеса' })).toBeVisible()
  await expect(page.getByText(/Этапы из CSV|демо-счётчики/)).toHaveCount(0)

  await page.screenshot({
    path: 'test-results/owner-screen-two.png',
    fullPage: true,
  })
})

test('owner workspace today widget fits the first screen column', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('owner')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)

  const calendar = page.getByTestId('workspace-calendar-widget')
  const today = page.getByTestId('workspace-today-widget')
  await expect(calendar).toBeVisible()
  await expect(today).toBeVisible()

  const viewport = page.viewportSize()
  const calendarBox = await calendar.boundingBox()
  const todayBox = await today.boundingBox()

  expect(viewport).not.toBeNull()
  expect(calendarBox).not.toBeNull()
  expect(todayBox).not.toBeNull()

  expect(Math.abs((calendarBox?.x ?? 0) - (todayBox?.x ?? 0))).toBeLessThanOrEqual(2)
  expect(Math.abs((calendarBox?.width ?? 0) - (todayBox?.width ?? 0))).toBeLessThanOrEqual(2)
  expect((todayBox?.y ?? 0) + (todayBox?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1)
})

test('legacy leads control page redirects to the leads workspace', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('owner')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto('/#/dashboard/leads')

  await expect(page).toHaveURL(/#\/dashboard\/leads\/poker/)
  await expect(page.getByRole('heading', { name: 'Контроль лидов' })).toHaveCount(0)
  await expect(page.getByText('Открыть рабочую область')).toHaveCount(0)
})

test('owner funnel widget opens team report', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('owner')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.getByRole('tab', { name: '2' }).click()
  await page.getByRole('link', { name: 'Отчёт →' }).first().click()

  await expect(page).toHaveURL(/#\/dashboard\/reports\/team/)
  await expect(page.getByRole('heading', { name: 'Отчёт по работе менеджеров' })).toBeVisible()
})

test('owner business pulse widget opens manager report', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('owner')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.getByRole('tab', { name: '2' }).click()

  const managerReportLink = page.locator('a[href="#/dashboard/reports/manager"]').filter({ hasText: 'Отчёт →' })
  await expect(managerReportLink).toHaveCount(1)
  await managerReportLink.click()

  await expect(page).toHaveURL(/#\/dashboard\/reports\/manager/)
  await expect(page.getByRole('heading', { name: 'Отчёт по менеджеру' })).toBeVisible()
})

test('my report lets user set personal plan', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('manager')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto('/#/dashboard/my-report')

  await page.getByRole('button', { name: 'Поставить себе планы' }).click()
  await page.getByLabel('Выручка, $').fill('7000000')
  await page.getByLabel('Лиды').fill('9')
  await page.getByRole('button', { name: 'Сохранить план' }).click()

  await expect(page.getByText('$7M')).toBeVisible()
  await expect(page.getByText('9').first()).toBeVisible()
})
