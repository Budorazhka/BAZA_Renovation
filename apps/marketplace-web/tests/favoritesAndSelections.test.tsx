/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { FavoritesPage } from '../src/pages/FavoritesPage'
import { SelectionsPage } from '../src/pages/SelectionsPage'
import { SelectionDetailPage } from '../src/pages/SelectionDetailPage'
import { marketplaceApi } from '../src/api/marketplace-api'
import { publishingApi, PublishingApiError } from '../src/features/publishing/api/publishing-api'

vi.mock('../src/features/publishing/api/publishing-api', async () => {
  const actual = await vi.importActual<typeof import('../src/features/publishing/api/publishing-api')>(
    '../src/features/publishing/api/publishing-api',
  )
  return {
    ...actual,
    publishingApi: {
      listFavorites: vi.fn(),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    },
  }
})

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

  /**
   * Избранное снято с фикстур 04.09.2026. До этого страница показывала
   * захардкоженный список, никак не связанный с тем, что человек нажимал на
   * карточках: сердечко было локальным useState(false) и ничего не сохраняло.
   */
  describe('Избранное покупателя (MKT-SCR-017)', () => {
    const ENTRIES = [
      { targetType: 'listing' as const, slug: 'kvartira-more', createdAt: '2026-09-02T10:00:00.000Z' },
    ]

    const LISTING = {
      slug: 'kvartira-more',
      dealType: 'sale' as const,
      propertyType: 'apartment' as const,
      price: { amountMinorUnits: 8_500_000, currency: 'USD' },
      characteristics: { rooms: 2, area: 65, floor: 12, totalFloors: 24 },
      location: { city: 'Батуми', address: 'ул. Химшиашвили, 15' },
    }

    it('показывает то, что пользователь действительно сохранил', async () => {
      ;(publishingApi.listFavorites as any).mockResolvedValue(ENTRIES)
      ;(marketplaceApi.getListing as any).mockResolvedValue(LISTING)

      render(
        <MemoryRouter>
          <FavoritesPage />
        </MemoryRouter>,
      )

      expect(await screen.findByText(/Химшиашвили/)).toBeDefined()
      expect((publishingApi.listFavorites as any)).toHaveBeenCalled()
    })

    it('удаление уходит на сервер, а не только из локального списка', async () => {
      ;(publishingApi.listFavorites as any).mockResolvedValue(ENTRIES)
      ;(marketplaceApi.getListing as any).mockResolvedValue(LISTING)
      ;(publishingApi.removeFavorite as any).mockResolvedValue({ removed: true })

      render(
        <MemoryRouter>
          <FavoritesPage />
        </MemoryRouter>,
      )

      await screen.findByText(/Химшиашвили/)
      fireEvent.click(screen.getAllByRole('button', { name: /Удалить/i })[0])

      expect(publishingApi.removeFavorite).toHaveBeenCalledWith({
        targetType: 'listing',
        slug: 'kvartira-more',
      })
    })

    it('гостю предлагает войти, а не пустой список', async () => {
      // Именно PublishingApiError, а не любая ошибка со status: страница
      // проверяет тип, и подделка прошла бы мимо этой ветки.
      ;(publishingApi.listFavorites as any).mockRejectedValue(
        new PublishingApiError('unauthorized', 401),
      )

      render(
        <MemoryRouter>
          <FavoritesPage />
        </MemoryRouter>,
      )

      expect(await screen.findByText(/Избранное хранится в вашем аккаунте/)).toBeDefined()
      expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toContain('/auth/login')
    })

    it('снятый с публикации объект пропускается, страница не падает', async () => {
      ;(publishingApi.listFavorites as any).mockResolvedValue(ENTRIES)
      ;(marketplaceApi.getListing as any).mockRejectedValue(new Error('404'))

      render(
        <MemoryRouter>
          <FavoritesPage />
        </MemoryRouter>,
      )

      expect(await screen.findByRole('heading', { level: 1, name: /Избранное/i })).toBeDefined()
      expect(screen.queryByText(/Химшиашвили/)).toBeNull()
    })
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

  describe('Управление подборками клиента (SelectionsPage)', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('создает новую подборку и сохраняет её в localStorage', () => {
      render(
        <MemoryRouter>
          <SelectionsPage />
        </MemoryRouter>,
      )

      const createBtn = screen.getByTestId('new-collection-btn')
      fireEvent.click(createBtn)

      expect(screen.getByDisplayValue(/Новая подборка/)).toBeDefined()
      const saved = JSON.parse(localStorage.getItem('baza:marketplace:selections') || '[]')
      expect(saved.length).toBeGreaterThanOrEqual(1)
      expect(saved[0].title).toContain('Новая подборка')
    })

    it('редактирует название подборки и обновляет localStorage', () => {
      render(
        <MemoryRouter>
          <SelectionsPage />
        </MemoryRouter>,
      )

      const inputs = screen.getAllByRole('textbox', { name: /Название подборки/i })
      fireEvent.change(inputs[0], { target: { value: 'Обновленное название' } })

      expect(screen.getByDisplayValue('Обновленное название')).toBeDefined()
      const saved = JSON.parse(localStorage.getItem('baza:marketplace:selections') || '[]')
      expect(saved[0].title).toBe('Обновленное название')
    })

    it('удаляет подборку и обновляет localStorage', () => {
      render(
        <MemoryRouter>
          <SelectionsPage />
        </MemoryRouter>,
      )

      const deleteButtons = screen.getAllByTitle('Удалить подборку')
      const countBefore = deleteButtons.length
      fireEvent.click(deleteButtons[0])

      const saved = JSON.parse(localStorage.getItem('baza:marketplace:selections') || '[]')
      expect(saved.length).toBe(countBefore - 1)
    })
  })
})
