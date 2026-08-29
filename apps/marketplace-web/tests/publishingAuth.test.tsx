/** @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublishingWizard } from '../src/features/publishing'
import { authApi } from '../src/features/publishing/api/auth-api'

vi.mock('../src/features/publishing/api/auth-api', () => ({
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
    ;(authApi.checkSession as any).mockResolvedValue(false)
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
    ;(authApi.checkSession as any).mockResolvedValue(false)
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
