import React, { useState, FormEvent } from 'react'

interface AuthStepProps {
  onLogin: (login: string, password: string) => Promise<any>
  onRegister: (login: string, password: string) => Promise<any>
  isLoading: boolean
  error: string | null
  onClearError: () => void
}

export function AuthStep({ onLogin, onRegister, isLoading, error, onClearError }: AuthStepProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
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
      // Error handled by parent hook
    }
  }

  return (
    <section className="wizard-step wizard-step--auth" data-testid="wizard-step-auth" aria-labelledby="auth-step-heading">
      <div className="wizard-step__header">
        <h2 id="auth-step-heading">
          {mode === 'login' ? 'Вход в аккаунт BAZA' : 'Регистрация автора объявления'}
        </h2>
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
          {isLoading
            ? 'Пожалуйста, подождите...'
            : mode === 'login'
              ? 'Войти и продолжить'
              : 'Зарегистрироваться и продолжить'}
        </button>
      </form>
    </section>
  )
}
