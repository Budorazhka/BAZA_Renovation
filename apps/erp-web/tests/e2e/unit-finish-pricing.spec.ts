import { expect, test, type Page } from '@playwright/test'

const PROJECT_ID = 'demo-baza-residence'
const UNIT_701_ID = 'demo-baza-residence-tower-a-unit-701'
const UNIT_702_ID = 'demo-baza-residence-tower-a-unit-702'

async function openDemoChessboard(page: Page) {
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

  await page.goto(`/#/dashboard/development/chessboard?project=${PROJECT_ID}`)
}

test('lot offers only priced finishes and recalculates the price', async ({ page }) => {
  await openDemoChessboard(page)
  const unit701 = page.locator(`[data-unit-id="${UNIT_701_ID}"]`)
  await expect(unit701).toBeVisible()
  await unit701.click()

  const finishSelect = page.getByLabel('Выбрать кондицию отделки')
  await expect(finishSelect.locator('option')).toHaveText(['Белый каркас', 'Под ключ'])
  await expect(finishSelect).toHaveValue('Белый каркас')
  await expect(page.getByText('$2 970/м²', { exact: true })).toBeVisible()
  await expect(page.getByText('$100 980', { exact: true })).toBeVisible()

  await finishSelect.selectOption('Под ключ')

  await expect(finishSelect).toHaveValue('Под ключ')
  await expect(page.getByText('$3 390/м²', { exact: true })).toBeVisible()
  await expect(page.getByText('$115 260', { exact: true })).toBeVisible()

  await page.goto(`/#/lot/${UNIT_701_ID}`)
  const publicFinishSelect = page.getByLabel('Выбрать кондицию отделки в характеристиках')
  await expect(publicFinishSelect.locator('option')).toHaveText(['Белый каркас', 'Под ключ'])
  await publicFinishSelect.selectOption('Под ключ')
  await expect(publicFinishSelect).toHaveValue('Под ключ')
  await expect(page.getByText('$115 260', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('$3 390/м²', { exact: true }).first()).toBeVisible()
})

test('mass editing updates a finish price without overwriting other finishes', async ({ page }) => {
  await openDemoChessboard(page)

  await page.getByRole('button', { name: 'Редактировать лоты', exact: true }).click()
  await page.locator(`[data-unit-id="${UNIT_701_ID}"]`).click()
  await page.locator(`[data-unit-id="${UNIT_702_ID}"]`).click({ modifiers: ['Control'] })
  await expect(page.getByText('Выбрано: 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Редактировать выбранные', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Выбрано лотов: 2' })).toBeVisible()
  await page.getByLabel('Кондиция для массового изменения').selectOption('Под ключ')
  await page.getByLabel('Цена выбранной кондиции за м²').fill('3500')
  await page.getByRole('button', { name: 'Применить цену выбранной кондиции' }).click()
  await expect(page.getByText('Текущая цена: $3 500/м²', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Снять выделение' }).click()
  await page.getByRole('button', { name: 'Редактировать лоты', exact: true }).click()
  await page.locator(`[data-unit-id="${UNIT_701_ID}"]`).click()

  const finishSelect = page.getByLabel('Выбрать кондицию отделки')
  await finishSelect.selectOption('Под ключ')
  await expect(page.getByText('$3 500/м²', { exact: true })).toBeVisible()
  await finishSelect.selectOption('Белый каркас')
  await expect(page.getByText('$2 970/м²', { exact: true })).toBeVisible()
})
