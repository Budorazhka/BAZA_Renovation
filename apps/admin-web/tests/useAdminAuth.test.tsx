/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from '../src/api/admin-api'
import { AdminAuthProvider, useAdminAuth } from '../src/hooks/useAdminAuth'
import { RequireAdmin, RequireSuperAdmin } from '../src/hooks/RequireAdmin'

/**
 * Собственный лёгкий double вместо vi.mock('../src/api/admin-api') — то же
 * обоснование, что no-mock-data.test.tsx: подменяем ТОЛЬКО adminApi.me,
 * остальной React-код (useAdminAuth, RequireAdmin) выполняется реально —
 * тест доказывает поведение guard'а, не заглушку вместо него.
 *
 * Без @testing-library/jest-dom (не установлен в этой монорепо — ни один
 * существующий app его не тянет) — проверки построены на самих query-
 * результатах (null/Element), не на .toBeInTheDocument()/.toHaveTextContent().
 */
function mockAdminApiMe(impl: () => Promise<unknown>) {
  vi.doMock('../src/api/admin-api', async () => {
    const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
    return { ...actual, adminApi: { ...actual.adminApi, me: impl } }
  })
}

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('RequireAdmin — не рендерит защищённый контент без реальной серверной сессии', () => {
  it('пока /admin/me не ответил — рендерит нейтральный "проверяем сессию", НЕ защищённый контент и НЕ форму входа', async () => {
    mockAdminApiMe(() => new Promise(() => {})) // никогда не резолвится — эмулирует in-flight запрос
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { RequireAdmin: Guard } = await import('../src/hooks/RequireAdmin')

    render(
      <MemoryRouter initialEntries={['/publications']}>
        <Provider>
          <Guard>
            <div>СЕКРЕТНЫЙ КОНТЕНТ</div>
          </Guard>
        </Provider>
      </MemoryRouter>,
    )

    expect(screen.queryByText('СЕКРЕТНЫЙ КОНТЕНТ')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Проверяем сессию/)
  })

  it('/admin/me отвечает 403 (нет активной admin-сессии) — защищённый контент НИКОГДА не рендерится', async () => {
    mockAdminApiMe(() => Promise.reject(new AdminApiError('Forbidden', 403, 'FORBIDDEN')))
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { RequireAdmin: Guard } = await import('../src/hooks/RequireAdmin')

    render(
      <MemoryRouter initialEntries={['/publications']}>
        <Provider>
          <Guard>
            <div>СЕКРЕТНЫЙ КОНТЕНТ</div>
          </Guard>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.queryByText('СЕКРЕТНЫЙ КОНТЕНТ')).toBeNull()
  })

  it('/admin/me отвечает 200 с реальными данными — защищённый контент рендерится', async () => {
    mockAdminApiMe(() => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: false, publicationReadScope: 'all' }))
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { RequireAdmin: Guard } = await import('../src/hooks/RequireAdmin')

    render(
      <MemoryRouter initialEntries={['/publications']}>
        <Provider>
          <Guard>
            <div>СЕКРЕТНЫЙ КОНТЕНТ</div>
          </Guard>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('СЕКРЕТНЫЙ КОНТЕНТ')).not.toBeNull())
  })
})

describe('RequireSuperAdmin — scoped admin (isSuperAdmin:false) никогда не видит super_admin-only контент', () => {
  it('signed-in, но isSuperAdmin:false — рендерит отказ, НЕ контент управления аккаунтами', async () => {
    mockAdminApiMe(() => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: false, publicationReadScope: 'all' }))
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { RequireSuperAdmin: Guard } = await import('../src/hooks/RequireAdmin')

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Provider>
          <Guard>
            <div>УПРАВЛЕНИЕ АККАУНТАМИ</div>
          </Guard>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/доступен только super_admin/i)).not.toBeNull())
    expect(screen.queryByText('УПРАВЛЕНИЕ АККАУНТАМИ')).toBeNull()
  })

  it('signed-in и isSuperAdmin:true — рендерит защищённый контент', async () => {
    mockAdminApiMe(() => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: true, publicationReadScope: 'all' }))
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { RequireSuperAdmin: Guard } = await import('../src/hooks/RequireAdmin')

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Provider>
          <Guard>
            <div>УПРАВЛЕНИЕ АККАУНТАМИ</div>
          </Guard>
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('УПРАВЛЕНИЕ АККАУНТАМИ')).not.toBeNull())
  })
})

describe('useAdminAuth throws outside its provider — no silent undefined-context bypass', () => {
  it('бросает понятную ошибку, а не молча возвращает undefined/null state', () => {
    function Unwrapped() {
      useAdminAuth()
      return null
    }
    expect(() => render(<Unwrapped />)).toThrow(/useAdminAuth must be used within AdminAuthProvider/)
  })
})

describe('useAdminAuth.logout — реально вызывает POST /auth/logout, переводит state в signed-out', () => {
  function mockAdminApiMeAndLogout(logoutImpl: () => Promise<unknown>) {
    vi.doMock('../src/api/admin-api', async () => {
      const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
      return {
        ...actual,
        adminApi: {
          ...actual.adminApi,
          me: () => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: true, publicationReadScope: 'all' }),
          logout: logoutImpl,
        },
      }
    })
  }

  it('logout() вызывает реальный adminApi.logout и переводит state в signed-out после успеха', async () => {
    const logoutSpy = vi.fn(() => Promise.resolve({ loggedOut: true as const }))
    mockAdminApiMeAndLogout(logoutSpy)
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { useAdminAuth: useAuth } = await import('../src/hooks/useAdminAuth')

    function Probe() {
      const { state, logout } = useAuth()
      return (
        <div>
          <span data-testid="status">{state.status}</span>
          <button onClick={() => void logout()}>logout</button>
        </div>
      )
    }

    render(
      <MemoryRouter initialEntries={['/publications']}>
        <Provider>
          <Probe />
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-in'))
    screen.getByText('logout').click()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'))
    expect(logoutSpy).toHaveBeenCalledTimes(1)
  })

  it('logout() всё равно переводит state в signed-out, даже если сетевой запрос падает', async () => {
    mockAdminApiMeAndLogout(() => Promise.reject(new Error('network error')))
    const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
    const { useAdminAuth: useAuth } = await import('../src/hooks/useAdminAuth')
    let logoutPromise: Promise<void> | undefined

    function Probe() {
      const { state, logout } = useAuth()
      return (
        <div>
          <span data-testid="status">{state.status}</span>
          <button onClick={() => { logoutPromise = logout() }}>logout</button>
        </div>
      )
    }

    render(
      <MemoryRouter initialEntries={['/publications']}>
        <Provider>
          <Probe />
        </Provider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-in'))
    screen.getByText('logout').click()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'))
    await expect(logoutPromise).resolves.toBeUndefined()
  })
})
