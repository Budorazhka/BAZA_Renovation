/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyPropertiesPage } from '../src/pages/MyPropertiesPage'
import { publishingApi } from '../src/features/publishing/api/publishing-api'

vi.mock('../src/features/publishing/api/publishing-api', async () => {
  const actual = await vi.importActual<typeof import('../src/features/publishing/api/publishing-api')>(
    '../src/features/publishing/api/publishing-api',
  )
  return {
    ...actual,
    publishingApi: {
      listPropertyAssets: vi.fn(),
      listListingsForAsset: vi.fn(),
    },
  }
})

const SEA_VIEW = {
  _id: 'asset-1',
  propertyType: 'Квартира',
  location: { country: 'GE', city: 'Батуми', address: 'ул. Химшиашвили, 15' },
  characteristics: { area: 65, rooms: 2, floor: 12, totalFloors: 24 },
  representativePhone: '+995500000001',
  version: 1,
}

const VAKE = {
  _id: 'asset-2',
  propertyType: 'Апартаменты',
  location: { country: 'GE', city: 'Тбилиси', address: 'Ваке, ул. Абашидзе 7' },
  characteristics: { area: 95, rooms: 3, floor: 4, totalFloors: 9 },
  representativePhone: '+995500000002',
  version: 1,
}

function listingFor(assetId: string, id: string, status: 'active' | 'archived' | 'expired') {
  return {
    _id: id,
    propertyAssetId: assetId,
    dealType: 'sale' as const,
    price: { amountMinorUnits: 8_500_000, currency: 'USD' },
    status,
    version: 1,
    createdAt: '2026-08-12T10:00:00.000Z',
  }
}

/**
 * Кабинет снят с фикстур 04.09.2026: до этого страница рисовала пять выдуманных
 * объектов вместе со счётчиками просмотров и контактов, показанными как
 * настоящие. Тесты соответственно проверяли выдуманные заголовки.
 */
describe('MyProperties Page Acceptance (MKT-SCR-019)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    ;(publishingApi.listPropertyAssets as any).mockResolvedValue([SEA_VIEW, VAKE])
    ;(publishingApi.listListingsForAsset as any).mockImplementation(async (assetId: string) =>
      assetId === 'asset-1'
        ? [listingFor('asset-1', 'listing-1', 'active')]
        : [listingFor('asset-2', 'listing-2', 'active')],
    )
  })

  afterEach(() => {
    cleanup()
  })

  function renderPage() {
    return render(
      <MemoryRouter>
        <MyPropertiesPage />
      </MemoryRouter>,
    )
  }

  it('показывает объекты владельца, полученные из API', async () => {
    renderPage()

    expect(await screen.findByText('Квартира, ул. Химшиашвили, 15')).toBeDefined()
    expect(screen.getByText('Апартаменты, Ваке, ул. Абашидзе 7')).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: /Мои объекты/i })).toBeDefined()
    expect(screen.getByTestId('account-add-property-cta')).toBeDefined()
  })

  it('не показывает счётчики просмотров: API их не отдаёт', async () => {
    renderPage()
    await screen.findByText('Квартира, ул. Химшиашвили, 15')

    // Слова «просмотров», «контактов» и «в избранном» остались на странице
    // только внутри блока счётчиков — из заголовка и SEO-описания обещание
    // аналитики убрано вместе с выдуманными числами.
    expect(screen.queryByText(/просмотров/)).toBeNull()
    expect(screen.queryByText(/контактов/)).toBeNull()
    expect(screen.queryByText(/в избранном/)).toBeNull()
  })

  it('у каждого объекта есть ссылка на редактирование с реальными id', async () => {
    renderPage()
    await screen.findByText('Квартира, ул. Химшиашвили, 15')

    const editLinks = screen.getAllByRole('link', { name: 'Редактировать' })
    expect(editLinks[0].getAttribute('href')).toBe(
      '/account/properties/asset-1/listings/listing-1/edit',
    )
  })

  it('ищет по адресу', async () => {
    renderPage()
    await screen.findByText('Квартира, ул. Химшиашвили, 15')

    const searchInput = screen.getByRole('searchbox', { name: /Поиск по моим объектам/i })
    fireEvent.change(searchInput, { target: { value: 'Ваке' } })

    expect(screen.getByText('Апартаменты, Ваке, ул. Абашидзе 7')).toBeDefined()
    expect(screen.queryByText('Квартира, ул. Химшиашвили, 15')).toBeNull()
  })

  it('переключается в табличный вид', async () => {
    renderPage()
    await screen.findByText('Квартира, ул. Химшиашвили, 15')

    fireEvent.click(screen.getByRole('button', { name: /Отображение таблицей/i }))

    expect(screen.getByRole('table', { name: /Таблица моих объектов/i })).toBeDefined()
  })

  it('пустой кабинет не притворяется заполненным', async () => {
    ;(publishingApi.listPropertyAssets as any).mockResolvedValue([])
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: /Мои объекты/i })).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Редактировать' })).toBeNull()
  })
})
