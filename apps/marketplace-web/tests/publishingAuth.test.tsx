/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublishingWizard } from '../src/features/publishing'
import { authApi } from '../src/features/auth/api/auth-api'
import { resetSessionStoreForTests } from '../src/features/auth/model/session-store'

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

describe('Publishing Wizard Auth & Session Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Состояние сессии теперь общее на приложение (session-store.ts), то есть
    // модульное и переживающее размонтирование. Без сброса второй тест начинал
    // бы с сессией, оставшейся от первого.
    resetSessionStoreForTests()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders auth step when user is unauthenticated', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('wizard-step-auth')).toBeDefined()
      expect(screen.getByRole('heading', { name: 'Вход в аккаунт BAZA' })).toBeDefined()
    })

    expect(screen.getByTestId('auth-input-login')).toBeDefined()
    expect(screen.getByTestId('auth-input-password')).toBeDefined()
    expect(screen.getByTestId('auth-submit-btn')).toBeDefined()
  })

  it('toggles between login and registration tabs', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-tab-register')).toBeDefined()
    })

    const registerTab = screen.getByTestId('auth-tab-register')
    fireEvent.click(registerTab)

    expect(screen.getByRole('heading', { name: 'Регистрация автора объявления' })).toBeDefined()
    expect(screen.getByTestId('auth-input-confirm-password')).toBeDefined()

    const loginTab = screen.getByTestId('auth-tab-login')
    fireEvent.click(loginTab)

    expect(screen.getByRole('heading', { name: 'Вход в аккаунт BAZA' })).toBeDefined()
    expect(screen.queryByTestId('auth-input-confirm-password')).toBeNull()
  })

  it('performs login and transitions to location step', async () => {
    // Сначала гость, после входа сервер узнаёт. Раньше здесь стояло
    // `mockResolvedValue(false)` на все вызовы: тест утверждал, что мастер
    // пускает дальше при сессии, которой сервер не подтверждает. Это и был
    // дефект — вход считался состоявшимся по ответу `POST /auth/login`.
    ;(authApi.checkSession as any).mockResolvedValueOnce(false).mockResolvedValue(true)
    ;(authApi.login as any).mockResolvedValue({ identityId: 'id-123', requires2fa: false })

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-input-login')).toBeDefined()
    })

    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'author@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'secretPassword123' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('author@test.local', 'secretPassword123')
      expect(screen.getByTestId('wizard-step-location')).toBeDefined()
    })
  })

  it('performs two-step registration (register -> login) and transitions to location step', async () => {
    ;(authApi.checkSession as any).mockResolvedValueOnce(false).mockResolvedValue(true)
    ;(authApi.register as any).mockResolvedValue({ identityId: 'new-id-456' })
    ;(authApi.login as any).mockResolvedValue({ identityId: 'new-id-456', requires2fa: false })

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-tab-register')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('auth-tab-register'))

    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'newauthor@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'strongPass123' } })
    fireEvent.change(screen.getByTestId('auth-input-confirm-password'), { target: { value: 'strongPass123' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith('newauthor@test.local', 'strongPass123')
      expect(authApi.login).toHaveBeenCalledWith('newauthor@test.local', 'strongPass123')
      expect(screen.getByTestId('wizard-step-location')).toBeDefined()
    })
  })

  it('logout clears in-progress form data so the next login on the same tab starts clean', async () => {
    ;(authApi.checkSession as any).mockResolvedValueOnce(false).mockResolvedValue(true)
    ;(authApi.login as any).mockResolvedValue({ identityId: 'user-a', requires2fa: false })
    ;(authApi.logout as any).mockResolvedValue({ loggedOut: true })

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('auth-input-login')).toBeDefined())
    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'user-a@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'pass-a-123' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => expect(screen.getByTestId('wizard-step-location')).toBeDefined())

    // User A fills in real PII before logging out without submitting.
    fireEvent.change(screen.getByTestId('location-input-address'), {
      target: { value: 'User A private address 42' },
    })

    fireEvent.click(screen.getByTestId('wizard-logout-btn'))
    await waitFor(() => expect(screen.getByTestId('wizard-step-auth')).toBeDefined())

    // A second identity logs in on the same tab, same component instance.
    ;(authApi.login as any).mockResolvedValue({ identityId: 'user-b', requires2fa: false })
    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'user-b@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'pass-b-456' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => expect(screen.getByTestId('wizard-step-location')).toBeDefined())

    // User B must never see User A's address pre-filled.
    const addressInput = screen.getByTestId('location-input-address') as HTMLInputElement
    expect(addressInput.value).toBe('')
  })

  it('успешный ответ входа без подтверждённой сессии дальше не пускает', async () => {
    // Ответ 200 на `POST /auth/login` означает «пароль верный», а не «сессия
    // работает»: между ними стоит cookie, которую браузер может не принять.
    // Ровно так и было при отказе `GET /auth/session` — вход отвечал успехом, а
    // сессии не возникало, и интерфейс уводил человека в закрытый раздел,
    // откуда его тут же выбрасывало обратно.
    ;(authApi.checkSession as any).mockResolvedValue(false)
    ;(authApi.login as any).mockResolvedValue({ identityId: 'id-123', requires2fa: false })

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('auth-input-login')).toBeDefined())
    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'author@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'secretPassword123' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => expect(authApi.login).toHaveBeenCalled())
    // Сессия перечитана и не подтверждена — остаёмся на шаге входа.
    await waitFor(() => expect(screen.getByTestId('wizard-step-auth')).toBeDefined())
    expect(screen.queryByTestId('wizard-step-location')).toBeNull()
  })

  it('shows a real login error instead of silently leaving the form unchanged', async () => {
    ;(authApi.checkSession as any).mockResolvedValue(false)
    ;(authApi.login as any).mockRejectedValue(new Error('Неверный логин или пароль'))

    render(
      <MemoryRouter>
        <PublishingWizard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('auth-input-login')).toBeDefined())
    fireEvent.change(screen.getByTestId('auth-input-login'), { target: { value: 'author@test.local' } })
    fireEvent.change(screen.getByTestId('auth-input-password'), { target: { value: 'wrong-pass' } })
    fireEvent.click(screen.getByTestId('auth-submit-btn'))

    await waitFor(() => expect(screen.getByTestId('auth-error').textContent).toContain('Неверный логин'))
    expect(screen.getByTestId('wizard-step-auth')).toBeDefined()
  })
})
