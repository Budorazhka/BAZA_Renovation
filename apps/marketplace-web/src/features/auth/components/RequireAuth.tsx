import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthSession } from '../model/useAuthSession'

/**
 * Пускает в раздел только вошедшего пользователя.
 *
 * До 04.09.2026 разделы кабинета (`/account/*`) открывались кому угодно: сами
 * экраны рисовали захардкоженные данные, поэтому отсутствие проверки не бросалось
 * в глаза. Как только за ними появится настоящий backend, открытый доступ стал бы
 * утечкой, поэтому проверка ставится сейчас, а не «когда подключим данные».
 *
 * Это не замена серверной проверке. Сессия живёт в httpOnly cookie, и решает
 * всегда сервер; здесь только UI-гейт, чтобы человек видел форму входа, а не
 * пустой экран с ошибками 401.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { isAuthenticated, isChecking } = useAuthSession()

  // Пока сессия проверяется, ничего не решаем: иначе на каждую перезагрузку
  // вошедший пользователь моргал бы формой входа.
  if (isChecking) {
    return (
      <div className="state-panel" role="status" aria-busy="true">
        <p>Проверяем доступ…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/auth/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <>{children}</>
}
