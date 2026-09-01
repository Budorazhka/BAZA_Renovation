import { expect, test, type Page } from '@playwright/test'

async function loginAs(page: Page, login: string) {
  await page.goto('/')
  await page.getByPlaceholder(/owner \/ director/).fill(login)
  await page.getByPlaceholder('Пароль').fill('1')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/)
  await page.goto('/#/dashboard/settings/profile')
}

test('MLS demo accounts share manager cabinet but differ by profile MLS badge', async ({ page }) => {
  await loginAs(page, 'manager')
  await expect(page.getByText('MLS: не подключён')).toBeVisible()
  await expect(page.getByLabel('Вы член MLS')).toHaveCount(0)

  await page.evaluate(() => localStorage.clear())

  await loginAs(page, 'mls-manager')
  await expect(page.getByText('MLS: верифицирован')).toBeVisible()
  await expect(page.getByLabel('Вы член MLS')).toBeVisible()

  await page.goto('/#/dashboard/objects/list')
  await expect(page.getByLabel('Вы член MLS')).toBeVisible()

  const compactMlsStatus = page.locator('.objects-mls-promo.is-member')
  await expect(compactMlsStatus).toBeVisible()
  await expect(async () => {
    const box = await compactMlsStatus.boundingBox()
    expect(box?.width).toBeLessThan(180)
  }).toPass()
})
