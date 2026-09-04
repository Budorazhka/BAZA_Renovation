import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthForm } from '../features/auth/components/AuthForm'
import { useAuthSession } from '../features/auth/model/useAuthSession'

/**
 * MKT-SCR-013: самостоятельные страницы входа и регистрации.
 *
 * До этого форма входа существовала только внутри мастера публикации: попасть в
 * неё можно было, лишь начав размещать объект. Разделы кабинета при этом
 * открывались вообще без входа.
 *
 * Отдельного фрейма в Figma нет (зафиксированный gap). Владелец 04.09.2026
 * разрешил собрать экран из компонентов UI kit — форма переиспользуется, а не
 * рисуется заново.
 */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isChecking, error, login, registerAndLogin, checkStatus } = useAuthSession()

  /**
   * Куда вернуть после входа. Значение берётся только из `?next=` и только если
   * это путь внутри приложения: открытый redirect на чужой домен через параметр
   * адреса — классический способ увести человека с настоящего сайта на копию
   * формы входа.
   */
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/account/properties'

  useEffect(() => {
    if (isAuthenticated) navigate(next, { replace: true })
  }, [isAuthenticated, navigate, next])

  return (
    <div className="auth-page-shell">
      <AuthForm
        variant="page"
        initialMode={mode}
        isLoading={isChecking}
        error={error}
        onClearError={() => {}}
        onLogin={async (loginStr, password) => {
          const result = await login(loginStr, password)
          await checkStatus()
          return result
        }}
        onRegister={async (loginStr, password) => {
          const result = await registerAndLogin(loginStr, password)
          await checkStatus()
          return result
        }}
      />
    </div>
  )
}
