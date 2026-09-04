import React, { useState, type FormEvent } from 'react'
// Разметка формы использует классы wizard-* — стили лежат в мастере публикации,
// откуда форма и была вынесена. Импорт здесь, у самой разметки, а не у страницы:
// иначе форма выглядела бы по-разному в зависимости от места вызова.
import '../../publishing/styles/publishing.css'
import '../styles/auth.css'

export interface AuthFormProps {
  onLogin: (login: string, password: string) => Promise<unknown>
  onRegister: (login: string, password: string) => Promise<unknown>
  isLoading: boolean
  error: string | null
  onClearError: () => void
  /**
   * Где форма живёт. Отличаются только обрамление и надписи на кнопке:
   * в мастере публикации вход — шаг процесса («войти и продолжить»), на
   * отдельной странице — самостоятельное действие.
   */
  variant?: 'wizard' | 'page'
  /** Какая вкладка открыта изначально. Нужно маршрутам /auth/login и /auth/register. */
  initialMode?: 'login' | 'register'
}

/**
 * MKT-SCR-013: форма входа и регистрации.
 *
 * Отдельного фрейма в Figma нет — зафиксированный gap
 * (`marketplace-screen-build-spec.md` §2). Владелец 04.09.2026 разрешил собрать
 * её из компонентов UI kit (`40:4517`).
 *
 * Раньше эта форма жила внутри мастера публикации и была доступна только по
 * пути «разместить объект». Вынесена сюда без изменения разметки и testid, чтобы
 * тем же кодом обслуживать и шаг мастера, и самостоятельные страницы входа: две
 * формы авторизации в одном приложении неизбежно разошлись бы в валидации.
 */
export function AuthForm({
  onLogin,
  onRegister,
  isLoading,
  error,
  onClearError,
  variant = 'wizard',
  initialMode = 'login',
}: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [loginInput, setLoginInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    onClearError()

    if (!loginInput.trim()) {
      setValidationError('Укажите логин или email')
      return
    }

    if (passwordInput.length < 8) {
      setValidationError('Пароль должен содержать не менее 8 символов')
      return
    }

    if (mode === 'register' && passwordInput !== confirmPasswordInput) {
      setValidationError('Пароли не совпадают')
      return
    }

    try {
      if (mode === 'login') {
        await onLogin(loginInput.trim(), passwordInput)
      } else {
        await onRegister(loginInput.trim(), passwordInput)
      }
    } catch {
      // Ошибку показывает вызывающий хук через prop error.
    }
  }

  const isWizard = variant === 'wizard'
  const submitLabel = isLoading
    ? 'Пожалуйста, подождите...'
    : mode === 'login'
      ? isWizard
        ? 'Войти и продолжить'
        : 'Войти'
      : isWizard
        ? 'Зарегистрироваться и продолжить'
        : 'Зарегистрироваться'

  return (
    <section
      className={isWizard ? 'wizard-step wizard-step--auth' : 'auth-page'}
      data-testid={isWizard ? 'wizard-step-auth' : 'auth-page'}
      aria-labelledby="auth-step-heading"
    >
      <div className="wizard-step__header">
        <h1 id="auth-step-heading">
          {mode === 'login'
            ? 'Вход в аккаунт BAZA'
            : isWizard
              ? 'Регистрация автора объявления'
              : 'Регистрация в BAZA'}
        </h1>
        <p className="wizard-step__subtitle">
          {mode === 'login'
            ? 'Войдите, чтобы управлять объектами и публиковать объявления'
            : 'Создайте аккаунт, чтобы разместить объект в каталоге маркетплейса'}
        </p>
      </div>

      <div className="wizard-auth-toggle" role="tablist" aria-label="Форма авторизации">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`wizard-auth-toggle__btn ${mode === 'login' ? 'is-active' : ''}`}
          onClick={() => {
            setMode('login')
            setValidationError(null)
            onClearError()
          }}
          data-testid="auth-tab-login"
        >
          Вход
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`wizard-auth-toggle__btn ${mode === 'register' ? 'is-active' : ''}`}
          onClick={() => {
            setMode('register')
            setValidationError(null)
            onClearError()
          }}
          data-testid="auth-tab-register"
        >
          Регистрация
        </button>
      </div>

      {(validationError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert" data-testid="auth-error">
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label htmlFor="auth-login">Логин или Email *</label>
          <input
            id="auth-login"
            type="text"
            autoComplete="username"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            placeholder="author@example.com"
            disabled={isLoading}
            required
            data-testid="auth-input-login"
          />
        </div>

        <div className="wizard-field">
          <label htmlFor="auth-password">Пароль *</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Не менее 8 символов"
            disabled={isLoading}
            required
            data-testid="auth-input-password"
          />
        </div>

        {mode === 'register' && (
          <div className="wizard-field">
            <label htmlFor="auth-confirm-password">Подтверждение пароля *</label>
            <input
              id="auth-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPasswordInput}
              onChange={(e) => setConfirmPasswordInput(e.target.value)}
              placeholder="Повторите пароль"
              disabled={isLoading}
              required
              data-testid="auth-input-confirm-password"
            />
          </div>
        )}

        <button
          type="submit"
          className="wizard-btn wizard-btn--primary wizard-btn--block"
          disabled={isLoading}
          aria-busy={isLoading}
          data-testid="auth-submit-btn"
        >
          {submitLabel}
        </button>
      </form>
    </section>
  )
}
