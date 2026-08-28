import { useCallback, useEffect, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminAccountListItem } from '../types/admin'

export type AdminAccountsState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: AdminAccountListItem[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string }
  | { status: 'forbidden' }

/**
 * GET /admin/accounts — super_admin-only на сервере (AdminAccountService.
 * requireSuperAdmin). 'forbidden' — отдельный state, не 'error': scoped
 * admin, случайно попавший на этот экран (например, по прямой ссылке),
 * должен увидеть понятное "нет доступа", не generic "ошибка загрузки" с
 * кнопкой "повторить", которая никогда не сработает.
 */
export function useAdminAccounts(): {
  state: AdminAccountsState
  reload: () => void
  loadMore: () => void
} {
  const [state, setState] = useState<AdminAccountsState>({ status: 'loading' })
  const [cursor, setCursor] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const response = await adminApi.listAdminAccounts({ limit: 20 })
      setCursor(response.nextCursor)
      if (response.items.length === 0) {
        setState({ status: 'empty' })
      } else {
        setState({ status: 'ready', items: response.items, nextCursor: response.nextCursor, loadingMore: false })
      }
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 403) {
        setState({ status: 'forbidden' })
        return
      }
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить список аккаунтов.'
      setState({ status: 'error', message })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = useCallback(() => {
    if (!cursor) return
    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true } : current))
    void adminApi.listAdminAccounts({ cursor, limit: 20 }).then(
      (response) => {
        setCursor(response.nextCursor)
        setState((current) =>
          current.status === 'ready'
            ? { status: 'ready', items: [...current.items, ...response.items], nextCursor: response.nextCursor, loadingMore: false }
            : current,
        )
      },
      (cause: unknown) => {
        const message = cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить следующую страницу.'
        setState({ status: 'error', message })
      },
    )
  }, [cursor])

  return { state, reload: () => void load(), loadMore }
}
