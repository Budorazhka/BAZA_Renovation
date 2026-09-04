/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { marketplaceApi } from '../src/api/marketplace-api'
import { authApi } from '../src/features/auth/api/auth-api'

vi.mock('../src/api/marketplace-api', () => ({
  marketplaceApi: {
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

vi.mock('../src/features/auth/api/auth-api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    checkSession: vi.fn(),
  },
  AuthApiError: class extends Error {
    constructor(msg: string, readonly status: number) {
      super(msg)
      this.name = 'AuthApiError'
    }
  },
}))

/**
 * MKT-SCR-013. До 04.09.2026 форма входа существовала только внутри мастера
 * публикации, а разделы кабинета открывались без всякой проверки. Тест
 * закрывает обе половины: страницы входа есть, и кабинет за ними закрыт.
 */
describe('Авторизация и доступ в кабинет', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(marketplaceApi.listDevelopments as any).mockResolvedValue({ items: [], nextCursor: null, total: 0 })
    ;(marketplaceApi.listListings as any).mockResolvedValue({ items: [], nextCursor: null, total: 0 })
  })

  afterEach(() => {
    cleanup()
  })

  it('/auth/login открывает форму входа', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)

    render(
      <MemoryRouter initialEntries={['/auth/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('auth-page')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Вход в аккаунт BAZA' })).toBeTruthy()
  })

  it('/auth/register открывает форму сразу на вкладке регистрации', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)

    render(
      <MemoryRouter initialEntries={['/auth/register']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Регистрация в BAZA' })).toBeTruthy()
    // Подтверждение пароля есть только в режиме регистрации.
    expect(screen.getByTestId('auth-input-confirm-password')).toBeTruthy()
  })

  it('кабинет без входа отправляет на форму входа и запоминает, куда вернуть', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)

    render(
      <MemoryRouter initialEntries={['/account/properties']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('auth-page')).toBeTruthy()
    // Экран кабинета показываться не должен.
    expect(screen.queryByRole('heading', { name: /Мои объекты/ })).toBeNull()
  })

  it('вошедшего пользователя кабинет пускает', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(true)

    render(
      <MemoryRouter initialEntries={['/account/properties']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByTestId('auth-page')).toBeNull())
    expect(authApi.checkSession).toHaveBeenCalled()
  })
})
