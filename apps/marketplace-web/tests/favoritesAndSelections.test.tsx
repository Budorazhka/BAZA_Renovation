/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { FavoritesPage } from '../src/pages/FavoritesPage'
import { SelectionsPage } from '../src/pages/SelectionsPage'
import { SelectionDetailPage } from '../src/pages/SelectionDetailPage'
import { marketplaceApi } from '../src/api/marketplace-api'

vi.mock('../src/api/marketplace-api', () => ({
  marketplaceApi: {
    getPublicSelection: vi.fn(),
    listDevelopments: vi.fn(),
    listListings: vi.fn(),
    getDevelopment: vi.fn(),
    getListing: vi.fn(),
    revealDevelopmentContact: vi.fn(),
    revealListingContact: vi.fn(),
  },
  MarketplaceApiError: class extends Error {
    constructor(msg: string, readonly status: number) {
      super(msg)
      this.name = 'MarketplaceApiError'
    }
  },
}))

describe('Favorites & Selections Acceptance (MKT-SCR-017, MKT-SCR-018)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders favorites page with counter and saved items', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Избранное/i })).toBeDefined()
    expect(screen.getByTestId('favorites-count-badge')).toBeDefined()
    expect(screen.getByText('2-комн. апартаменты с панорамным видом на море')).toBeDefined()
    expect(screen.getByText('Студия под ключ в Orbi City')).toBeDefined()
  })

  it('filters favorites by deal type tabs and text search', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )

    const longRentTab = screen.getByRole('tab', { name: /Долгосрок/i })
    fireEvent.click(longRentTab)

    expect(screen.getByText('Просторная 3-комнатная квартира в Ваке')).toBeDefined()
    expect(screen.queryByText('Студия под ключ в Orbi City')).toBeNull()

    const searchInput = screen.getByRole('searchbox', { name: /Поиск по избранному/i })
    fireEvent.change(searchInput, { target: { value: 'Ваке' } })
    expect(screen.getByText('Просторная 3-комнатная квартира в Ваке')).toBeDefined()
  })

  it('removes item from favorites when clicking heart/remove button', () => {
    render(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )

    const removeBtns = screen.getAllByRole('button', { name: /Удалить/i })
    fireEvent.click(removeBtns[0])

    expect(screen.queryByText('2-комн. апартаменты с панорамным видом на море')).toBeNull()
  })

  it('renders selections page with collection cards and creates new collection', () => {
    render(
      <MemoryRouter>
        <SelectionsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: /Мои подборки/i })).toBeDefined()
    expect(screen.getByDisplayValue('Подборка для инвестора (Батуми у моря)')).toBeDefined()

    const newBtn = screen.getByTestId('new-collection-btn')
    fireEvent.click(newBtn)

    expect(screen.getByDisplayValue(/Новая подборка/i)).toBeDefined()
  })

  /**
   * Страница подборки переписана 04.09.2026. Раньше она игнорировала токен и
   * всем показывала одну и ту же декорацию: выдуманные объекты, выдуманного
   * эксперта «Георгий Беридзе» и выдуманный номер WhatsApp. Тест это поведение
   * закреплял, поэтому переписан вместе со страницей.
   */
  describe('Персональная подборка по ссылке (MKT-SCR-018)', () => {
    const SELECTION = {
      title: 'Подборка для инвестора',
      clientName: 'Анна',
      agentNote: 'Отобрал по вашему бюджету',
      status: 'viewed',
      items: [
        {
          unitId: 'unit-1',
          agentNote: 'Лучший вид из этой линии',
          unit: {
            number: '42',
            kind: 'apartment',
            rooms: 2,
            area: 65,
            price: { amountMinorUnits: 8_500_000, currency: 'USD' },
            status: 'available',
          },
        },
      ],
      createdAt: '2026-09-01T10:00:00.000Z',
      viewCount: 1,
    }

    function renderSelection() {
      return render(
        <MemoryRouter initialEntries={['/selections/token-abc']}>
          <Routes>
            <Route path="/selections/:slug" element={<SelectionDetailPage />} />
          </Routes>
        </MemoryRouter>,
      )
    }

    it('показывает объекты и заметки из подборки, а не декорацию', async () => {
      ;(marketplaceApi.getPublicSelection as any).mockResolvedValue(SELECTION)
      renderSelection()

      expect(await screen.findByRole('heading', { level: 1, name: 'Подборка для инвестора' })).toBeDefined()
      expect(screen.getByText('Квартира №42')).toBeDefined()
      expect(screen.getByText('85 000 USD')).toBeDefined()
      expect(screen.getByText('Лучший вид из этой линии')).toBeDefined()
      // Выдуманного эксперта на странице больше нет.
      expect(screen.queryByText('Георгий Беридзе')).toBeNull()
    })

    it('запрашивает подборку именно по токену из адреса', async () => {
      ;(marketplaceApi.getPublicSelection as any).mockResolvedValue(SELECTION)
      renderSelection()

      await screen.findByText('Квартира №42')
      expect((marketplaceApi.getPublicSelection as any).mock.calls[0][0]).toBe('token-abc')
    })

    it('устаревшая ссылка честно говорит об этом', async () => {
      const notFound = Object.assign(new Error('not found'), { status: 404 })
      ;(marketplaceApi.getPublicSelection as any).mockRejectedValue(notFound)
      renderSelection()

      expect(await screen.findByText(/Подборка не найдена/)).toBeDefined()
    })

    it('пропавший объект показывается пометкой, а не пустой карточкой', async () => {
      ;(marketplaceApi.getPublicSelection as any).mockResolvedValue({
        ...SELECTION,
        items: [{ unitId: 'unit-gone' }],
      })
      renderSelection()

      expect(await screen.findByText('Объект больше недоступен')).toBeDefined()
    })
  })
})
