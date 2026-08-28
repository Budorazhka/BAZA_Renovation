import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminMe } from '../types/admin'

export type AdminAuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; me: AdminMe }

interface AdminAuthContextValue {
  state: AdminAuthState
  login: (params: { login: string; password: string }) => Promise<void>
  refresh: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

/**
 * GET /admin/me — единственный источник истины "вошёл ли я и как
 * super_admin или как scoped admin". AdminGuard на сервере отдаёт 403
 * FORBIDDEN и на "нет cookie", и на "есть cookie, но нет активного
 * AdminAccount" (admin-context.middleware.ts) — с точки зрения клиента
 * оба случая означают одно и то же действие: показать экран входа. Здесь
 * НЕТ localStorage-роли/фейковой авторизации — единственный сигнал
 * "я вошёл" — успешный ответ реального /admin/me по httpOnly cookie.
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const me = await adminApi.me()
      setState({ status: 'signed-in', me })
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 403) {
        setState({ status: 'signed-out' })
        return
      }
      // Сетевая/непредвиденная ошибка — не самодиагностируем дальше здесь,
      // трактуем как "не вошёл", чтобы не застрять в вечном loading; экран
      // входа сам покажет ошибку при следующей попытке логина.
      setState({ status: 'signed-out' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (params: { login: string; password: string }) => {
      await adminApi.login(params)
      await refresh()
    },
    [refresh],
  )

  return <AdminAuthContext.Provider value={{ state, login, refresh }}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return ctx
}
