import { FormEvent, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AdminApiError } from '../api/admin-api'
import { useAdminAuth } from '../hooks/useAdminAuth'

/**
 * POST /auth/login (apps/api IdentityModule) — общий endpoint для всех
 * трёх продуктов, audience резолвится сервером по Origin-заголовку
 * (ADR-004), не полем формы. Успешный ответ выставляет httpOnly
 * `baza_session` cookie — эта форма никогда не хранит/читает токен сама,
 * только вызывает login() и ждёт результата useAdminAuth.refresh().
 */
export function LoginPage() {
  const { state, login } = useAdminAuth()
  const location = useLocation()
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.status === 'signed-in') {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/publications'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login({ login: loginValue.trim(), password })
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === 'AUTH_2FA_REQUIRED') {
        setError('Для этого аккаунта требуется двухфакторная аутентификация — она пока не поддерживается в этой панели.')
      } else if (cause instanceof AdminApiError && cause.code === 'AUTH_INVALID_CREDENTIALS') {
        setError('Неверный логин или пароль.')
      } else {
        setError('Не удалось войти. Попробуйте ещё раз.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="auth-eyebrow">BAZA Admin</p>
        <h1>Вход для администраторов</h1>
        <label htmlFor="login">Логин</label>
        <input id="login" autoComplete="username" value={loginValue} onChange={(e) => setLoginValue(e.target.value)} required />
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
