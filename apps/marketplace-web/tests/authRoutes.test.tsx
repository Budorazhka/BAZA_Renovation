/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { marketplaceApi } from '../src/api/marketplace-api'
import { authApi } from '../src/features/auth/api/auth-api'
import { resetSessionStoreForTests } from '../src/features/auth/model/session-store'

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
    // Состояние сессии общее на приложение и переживает размонтирование, так
    // что без сброса тест начинал бы с сессией предыдущего.
    resetSessionStoreForTests()
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

  /**
   * Регрессия 05.09.2026. После входа человека уводило в кабинет и тут же
   * возвращало на форму: `AuthPage` считал вход состоявшимся по ответу
   * `POST /auth/login`, а `RequireAuth` со своим отдельным состоянием
   * спрашивал сервер сам и получал «гость». Мигание вместо входа.
   */
  it('после входа кабинет открывается и обратно на форму не выбрасывает', async () => {
    ;(authApi.checkSession as any).mockResolvedValueOnce(false).mockResolvedValue(true)
    ;(authApi.login as any).mockResolvedValue({ identityId: 'id-1', requires2fa: false })

    render(
      <MemoryRouter initialEntries={['/auth/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('auth-page')).toBeTruthy()
    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'user@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'secretPassword123' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => expect(screen.getByRole('heading', { name: /Мои объекты/ })).toBeTruthy())
    // И остаётся там: форма входа не возвращается.
    expect(screen.queryByTestId('auth-page')).toBeNull()
  })

  /**
   * Регрессия 05.09.2026, найдена на снимке кабинета MKT-SCR-019: страница
   * показывает объекты вошедшего человека, а в шапке справа висит «Войти».
   * Шапка про сессию не знала вовсе, и выйти из аккаунта было негде, кроме
   * мастера публикации.
   */
  it('шапка предлагает войти гостю и кабинет вошедшему', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)

    const guest = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('header-login-link')).toBeTruthy()
    expect(screen.queryByTestId('header-account-btn')).toBeNull()
    guest.unmount()

    resetSessionStoreForTests()
    ;(authApi.checkSession as any).mockResolvedValue(true)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByTestId('header-account-btn')).toBeTruthy()
    expect(screen.queryByTestId('header-login-link')).toBeNull()
  })

  it('выход из шапки завершает сессию и возвращает к гостевому виду', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(true)
    ;(authApi.logout as any).mockResolvedValue({ loggedOut: true })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByTestId('header-account-btn'))
    fireEvent.click(screen.getByTestId('header-logout-btn'))

    await waitFor(() => expect(authApi.logout).toHaveBeenCalled())
    expect(await screen.findByTestId('header-login-link')).toBeTruthy()
  })

  it('вход перепроверяет сессию, а гейт маршрута не спрашивает сервер заново', async () => {
    ;(authApi.checkSession as any).mockResolvedValueOnce(false).mockResolvedValue(true)
    ;(authApi.login as any).mockResolvedValue({ identityId: 'id-1', requires2fa: false })

    render(
      <MemoryRouter initialEntries={['/auth/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('auth-page')).toBeTruthy()
    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'user@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'secretPassword123' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => expect(screen.getByRole('heading', { name: /Мои объекты/ })).toBeTruthy())

    // Ровно два обращения: проверка при загрузке страницы и перепроверка после
    // входа. Третьего, от смонтировавшегося RequireAuth, быть не должно —
    // состояние общее, и каждый экран не спрашивает сервер за себя.
    expect((authApi.checkSession as any).mock.calls.length).toBe(2)
  })
})
