import { expect, test } from '@playwright/test'

test('team BI report renders manager analytics without network leftovers', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder(/owner \/ director/i).fill('owner')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: /^(Войти|Sign in)$/ }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto('/#/dashboard/team/kpi')

  await expect(page.getByRole('heading', { name: 'Manager performance report' })).toBeVisible()
  await expect(page.getByText('Top 5 managers by leads')).toBeVisible()
  await expect(page.getByText('Manager ranking')).toBeVisible()
  await expect(page.getByText('$154.6M')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Sales' }).last()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Owner' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Team' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Broker' })).toBeVisible()
  await expect(page.getByText(/₽|руб/i)).toHaveCount(0)
  await expect(page.getByText(/реферал|партнёр|партнер|CSV|демо|Solitaire|Games/i)).toHaveCount(0)

  await page.screenshot({
    path: 'test-results/team-report.png',
    fullPage: true,
  })
})
