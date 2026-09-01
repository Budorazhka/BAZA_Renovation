import { expect, test } from '@playwright/test'

const PROJECT_ID = 'demo-baza-residence'
const UNIT_701_ID = 'demo-baza-residence-tower-a-unit-701'

test('demo residential complex is fully populated across Development screens', async ({ page }) => {
  await page.route('**/api/development/complexes**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/complexes')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            totalPages: 0,
          },
        },
      })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  await page.getByPlaceholder(/owner \/ director/i).fill('developer')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/#\/dashboard/)

  await page.goto('/#/dashboard/development/projects')

  await expect(page.getByText('ЖК BAZA Residence · Демо', { exact: true })).toBeVisible()
  await expect(page.getByText('BZ26 Development', { exact: true })).toBeVisible()
  await expect(page.getByText('Полностью заполнен', { exact: true })).toBeVisible()
  await expect(page.getByText('28 кв.', { exact: true })).toBeVisible()
  await expect(page.locator('img[src="/demo-development/render-exterior.svg"]')).toBeVisible()

  await page.getByRole('button', { name: 'Шахматка', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`development/chessboard\\?project=${PROJECT_ID}`))

  const unit701 = page.locator(`[data-unit-id="${UNIT_701_ID}"]`)
  await expect(unit701).toBeVisible()
  await unit701.click()

  await expect(page.getByRole('heading', { name: 'Лот 701' })).toBeVisible()
  await page.getByRole('button', { name: 'На этаже' }).click()
  await expect(page.getByLabel('Выбрать этаж')).toHaveValue('7')
  await expect(page.getByLabel('Выбрать секцию')).toHaveValue('demo-section-a')
  await expect(page.getByLabel('Интерактивный план этажа 7')).toBeVisible()
  await expect(page.getByLabel('Открыть лот 701, В продаже')).toBeVisible()
  await expect(page.getByLabel('Открыть лот 702, Бронь')).toBeVisible()

  await page.goto(`/#/dashboard/development/floorplans?project=${PROJECT_ID}`)

  await expect(page.getByText('ЖК BAZA Residence · Демо', { exact: true })).toBeVisible()
  await expect(page.getByText('28 лотов', { exact: false })).toBeVisible()
  await expect(page.getByText('28 обрисовано', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Библиотека', exact: true }).click()
  await expect(page.getByText('Студия · тип A', { exact: true })).toBeVisible()
  await expect(page.getByText('1+1 · тип B', { exact: true })).toBeVisible()
  await expect(page.getByText('2+1 · тип C', { exact: true })).toBeVisible()
  await expect(page.getByText('3+1 · тип D', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Поэтажные планы', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Этаж 1' })).toBeVisible()
  await expect(page.getByText('Лифтовой холл', { exact: true }).first()).toBeVisible()
})
