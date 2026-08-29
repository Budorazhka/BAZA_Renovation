import React from 'react'
import { Link } from 'react-router-dom'

interface PublicationProgressStepProps {
  status?: 'publication_pending' | 'published' | 'build_failed' | 'unpublished'
  publishedSlug?: string
  onRetry: () => Promise<void>
  onReset: () => void
  error: string | null
}

export function PublicationProgressStep({
  status,
  publishedSlug,
  onRetry,
  onReset,
  error,
}: PublicationProgressStepProps) {
  if (status === 'published' && publishedSlug) {
    return (
      <section className="wizard-step wizard-step--published" data-testid="wizard-step-published" aria-labelledby="pub-success-heading">
        <div className="wizard-result-box wizard-result-box--success">
          <div className="wizard-result-icon">🎉</div>
          <h2 id="pub-success-heading">Объявление успешно опубликовано!</h2>
          <p className="wizard-step__subtitle">
            Карточка объекта уже доступна в публичном каталоге маркетплейса BAZA.
          </p>

          <div className="wizard-published-actions">
            <Link
              to={`/listings/${publishedSlug}`}
              className="wizard-btn wizard-btn--primary"
              data-testid="view-published-listing-btn"
            >
              Открыть карточку объявления ↗
            </Link>
            <button
              type="button"
              className="wizard-btn wizard-btn--secondary"
              onClick={onReset}
              data-testid="publish-another-btn"
            >
              Разместить ещё одно объявление
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (status === 'build_failed' || error) {
    return (
      <section className="wizard-step wizard-step--error" data-testid="wizard-step-error" aria-labelledby="pub-error-heading">
        <div className="wizard-result-box wizard-result-box--error">
          <div className="wizard-result-icon">⚠️</div>
          <h2 id="pub-error-heading">Ошибка генерации публикации</h2>
          <p className="wizard-step__subtitle">
            {error || 'Не удалось завершить публикацию карточки объекта.'}
          </p>
          <div className="wizard-published-actions">
            <button
              type="button"
              className="wizard-btn wizard-btn--primary"
              onClick={onRetry}
              data-testid="publish-retry-btn"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      className="wizard-step wizard-step--publishing"
      data-testid="wizard-step-publishing"
      aria-labelledby="pub-pending-heading"
      aria-live="polite"
    >
      <div className="wizard-result-box wizard-result-box--pending">
        <div className="wizard-spinner" aria-hidden="true" />
        <h2 id="pub-pending-heading">Публикация объявления...</h2>
        <p className="wizard-step__subtitle">
          Пожалуйста, подождите. Система подготавливает поисковую проекцию и проверяет медиа-файлы.
        </p>
      </div>
    </section>
  )
}
