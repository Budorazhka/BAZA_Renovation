import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from './useAdminAuth'

/**
 * Защищает маршрут реальной проверкой сессии (useAdminAuth → GET
 * /admin/me), не флагом в localStorage. 'loading' рендерит нейтральный
 * placeholder вместо мгновенного редиректа на /login — иначе при обычном
 * F5 с валидной cookie пользователь на долю секунды увидел бы экран входа
 * до того, как /admin/me успеет ответить.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { state } = useAdminAuth()
  const location = useLocation()

  if (state.status === 'loading') {
    return (
      <div className="state-panel" role="status">
        Проверяем сессию…
      </div>
    )
  }

  if (state.status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

/** super_admin-only разделы (управление аккаунтами) — обычный scoped admin не должен видеть UI, которым не может пользоваться. */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { state } = useAdminAuth()

  if (state.status === 'loading') {
    return (
      <div className="state-panel" role="status">
        Проверяем сессию…
      </div>
    )
  }

  if (state.status === 'signed-out') {
    return <Navigate to="/login" replace />
  }

  if (!state.me.isSuperAdmin) {
    return (
      <div className="state-panel state-panel--error">
        <p>Раздел доступен только super_admin.</p>
      </div>
    )
  }

  return <>{children}</>
}
