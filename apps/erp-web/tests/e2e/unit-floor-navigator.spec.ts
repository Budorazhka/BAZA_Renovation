import { expect, test } from '@playwright/test'

const PROJECT_ID = 'project-floor-navigation'
const BUILDING_ID = 'building-floor-navigation'

const floorPlanSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640">
    <rect width="1200" height="640" fill="#f3efe4"/>
    <rect x="40" y="50" width="520" height="540" fill="#d9e8df" stroke="#274c3d" stroke-width="8"/>
    <rect x="640" y="50" width="520" height="540" fill="#eadfb9" stroke="#274c3d" stroke-width="8"/>
    <rect x="560" y="220" width="80" height="200" fill="#c7c1b2"/>
    <text x="300" y="330" text-anchor="middle" font-family="Arial" font-size="48" fill="#274c3d">701 / 702</text>
    <text x="900" y="330" text-anchor="middle" font-family="Arial" font-size="48" fill="#274c3d">703 / 704</text>
  </svg>
`

const floorPlanUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(floorPlanSvg)}`

test('unit card floor tab navigates floors and opens another apartment', async ({ page }) => {
  await page.route('**/api/development/complexes**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/complexes')) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              {
                id: PROJECT_ID,
                projectId: 'project-demo',
                name: 'ЖК Тестовый',
                slug: 'test',
                status: 'active',
                class: 'business',
                developer: 'BZ26',
                city: 'Тбилиси',
                country: 'Грузия',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
          },
        },
      })
      return
    }
    if (url.pathname.endsWith(`/complexes/${PROJECT_ID}/chessboard`)) {
      await route.fulfill({
        json: {
          success: true,
          data: {
            buildings: [
              {
                id: BUILDING_ID,
                name: 'Корпус 1',
                sections: [
                  {
                    id: 'section-a',
                    name: 'Секция А',
                    floors: [
                      {
                        floor: 6,
                        planUrl: null,
                        units: [
                          {
                            id: 'unit-601',
                            buildingId: BUILDING_ID,
                            floor: 6,
                            positionInFloor: 1,
                            number: '601',
                            rooms: 1,
                            roomsStr: '1+1',
                            area: 42,
                            price: 120000,
                            status: 'available',
                          },
                        ],
                      },
                      {
                        floor: 7,
                        planUrl: floorPlanUrl,
                        units: [
                          {
                            id: 'unit-701',
                            buildingId: BUILDING_ID,
                            floor: 7,
                            positionInFloor: 1,
                            number: '701',
                            rooms: 1,
                            roomsStr: '1+1',
                            area: 42,
                            price: 125000,
                            status: 'available',
                          },
                          {
                            id: 'unit-702',
                            buildingId: BUILDING_ID,
                            floor: 7,
                            positionInFloor: 2,
                            number: '702',
                            rooms: 2,
                            roomsStr: '2+1',
                            area: 64,
                            price: 180000,
                            status: 'reserved',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'section-b',
                    name: 'Секция Б',
                    floors: [
                      {
                        floor: 6,
                        planUrl: null,
                        units: [
                          {
                            id: 'unit-603',
                            buildingId: BUILDING_ID,
                            floor: 6,
                            positionInFloor: 3,
                            number: '603',
                            rooms: 1,
                            roomsStr: '1+1',
                            area: 44,
                            price: 128000,
                            status: 'available',
                          },
                        ],
                      },
                      {
                        floor: 7,
                        planUrl: floorPlanUrl,
                        units: [
                          {
                            id: 'unit-703',
                            buildingId: BUILDING_ID,
                            floor: 7,
                            positionInFloor: 3,
                            number: '703',
                            rooms: 3,
                            roomsStr: '3+1',
                            area: 88,
                            price: 245000,
                            status: 'sold',
                          },
                          {
                            id: 'unit-704',
                            buildingId: BUILDING_ID,
                            floor: 7,
                            positionInFloor: 4,
                            number: '704',
                            rooms: 1,
                            roomsStr: 'Студия',
                            area: 30,
                            price: 98000,
                            status: 'available',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      })
      return
    }
    await route.continue()
  })

  await page.route(`**/api/development/buildings/${BUILDING_ID}/plans`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          buildingId: BUILDING_ID,
          floorPlansFiles: [],
          apartmentsPlansFiles: [],
          floorPlansData: [
            {
              id: 'floor-map-7',
              buildingId: BUILDING_ID,
              floorNum: '7',
              imageId: 'floor-image-7',
              image: {
                id: 'floor-image-7',
                name: 'Floor 7',
                type: 'image/svg+xml',
                url: floorPlanUrl,
                createdAt: '2026-01-01T00:00:00.000Z',
              },
              apartments: [
                '701|available|0.04,0.08,0.25,0.08,0.25,0.92,0.04,0.92',
                '702|reserved|0.25,0.08,0.46,0.08,0.46,0.92,0.25,0.92',
                '703|sold|0.54,0.08,0.96,0.08,0.96,0.48,0.54,0.48',
                '704|available|0.54,0.52,0.96,0.52,0.96,0.92,0.54,0.92',
              ],
            },
          ],
        },
      },
    })
  })

  await page.goto('/')
  await page.getByPlaceholder(/owner \/ director/i).fill('developer')
  await page.getByPlaceholder('Пароль').fill('1')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page).toHaveURL(/#\/dashboard/)
  await page.goto(`/#/dashboard/development/chessboard?project=${PROJECT_ID}`)

  const sourceUnit = page.locator('[data-unit-id="unit-701"]')
  await expect(sourceUnit).toBeVisible()
  await sourceUnit.click()

  await expect(page.getByRole('heading', { name: 'Лот 701' })).toBeVisible()
  await page.getByRole('button', { name: 'На этаже' }).click()

  const floorSelect = page.getByLabel('Выбрать этаж')
  const sectionSelect = page.getByLabel('Выбрать секцию')
  await expect(floorSelect).toHaveValue('7')
  await expect(sectionSelect).toHaveValue('section-a')
  await expect(page.getByText('Свободно 1')).toBeVisible()
  await expect(page.getByText('Бронь 1')).toBeVisible()
  await expect(page.getByText('Продано 0')).toBeVisible()
  await expect(page.getByLabel('Интерактивный план этажа 7')).toBeVisible()
  await expect(page.getByLabel('Открыть лот 701, В продаже')).toHaveAttribute(
    'fill',
    'rgba(52,211,153,0.2)',
  )
  await expect(page.getByLabel('Открыть лот 702, Бронь')).toHaveAttribute(
    'fill',
    'rgba(230,195,100,0.24)',
  )

  await sectionSelect.selectOption('__all__')
  await expect(page.getByText('Свободно 2')).toBeVisible()
  await expect(page.getByText('Продано 1')).toBeVisible()

  await floorSelect.selectOption('6')
  await expect(page.getByText('Поэтажный план для этажа 6 не загружен')).toBeVisible()

  await floorSelect.selectOption('7')
  await page.getByLabel('Открыть лот 702, Бронь').click()

  await expect(page.getByRole('heading', { name: 'Лот 702' })).toBeVisible()
  await expect(page.getByText('Бронь', { exact: true }).first()).toBeVisible()
  await expect(floorSelect).toHaveValue('7')
  await expect(sectionSelect).toHaveValue('section-a')
})
