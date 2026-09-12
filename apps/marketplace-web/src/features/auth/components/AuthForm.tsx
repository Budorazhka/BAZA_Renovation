import React, { useState, type FormEvent } from 'react'
import { useI18n } from '../../../i18n'
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
  const { t } = useI18n()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    onClearError()

    if (!loginInput.trim()) {
      setValidationError(t('auth.errors.loginRequired'))
      return
    }

    if (passwordInput.length < 8) {
      setValidationError(t('auth.errors.passwordTooShort'))
      return
    }

    if (mode === 'register' && passwordInput !== confirmPasswordInput) {
      setValidationError(t('auth.errors.passwordsMismatch'))
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
    ? t('auth.submit.wait')
    : mode === 'login'
      ? isWizard
        ? t('auth.submit.loginWizard')
        : t('auth.submit.login')
      : isWizard
        ? t('auth.submit.registerWizard')
        : t('auth.submit.register')

  return (
    <section
      className={isWizard ? 'wizard-step wizard-step--auth' : 'auth-page'}
      data-testid={isWizard ? 'wizard-step-auth' : 'auth-page'}
      aria-labelledby="auth-step-heading"
    >
      <div className="wizard-step__header">
        <h1 id="auth-step-heading">
          {mode === 'login'
            ? t('auth.heading.login')
            : isWizard
              ? t('auth.heading.registerWizard')
              : t('auth.heading.register')}
        </h1>
        <p className="wizard-step__subtitle">
          {mode === 'login' ? t('auth.subtitle.login') : t('auth.subtitle.register')}
        </p>
      </div>

      <div className="wizard-auth-toggle" role="tablist" aria-label={t('auth.tabsLabel')}>
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
          {t('auth.tabs.login')}
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
          {t('auth.tabs.register')}
        </button>
      </div>

      {(validationError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert" data-testid="auth-error">
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label htmlFor="auth-login">{t('auth.fields.loginLabel')}</label>
          <input
            id="auth-login"
            type="text"
            autoComplete="username"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            placeholder="name@example.com"
            disabled={isLoading}
            required
            data-testid="auth-input-login"
          />
        </div>

        <div className="wizard-field">
          <label htmlFor="auth-password">{t('auth.fields.passwordLabel')}</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={t('auth.fields.passwordPlaceholder')}
            disabled={isLoading}
            required
            data-testid="auth-input-password"
          />
        </div>

        {mode === 'register' && (
          <div className="wizard-field">
            <label htmlFor="auth-confirm-password">{t('auth.fields.confirmPasswordLabel')}</label>
            <input
              id="auth-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPasswordInput}
              onChange={(e) => setConfirmPasswordInput(e.target.value)}
              placeholder={t('auth.fields.confirmPasswordPlaceholder')}
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
