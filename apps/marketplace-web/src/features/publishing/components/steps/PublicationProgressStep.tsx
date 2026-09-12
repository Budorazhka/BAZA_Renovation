import React from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../../i18n'

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
  const { t } = useI18n()

  if (status === 'published' && publishedSlug) {
    return (
      <section className="wizard-step wizard-step--published" data-testid="wizard-step-published" aria-labelledby="pub-success-heading">
        <div className="wizard-result-box wizard-result-box--success">
          <div className="wizard-result-icon">🎉</div>
          <h2 id="pub-success-heading">{t('publicationProgress.successTitle')}</h2>
          <p className="wizard-step__subtitle">{t('publicationProgress.successSubtitle')}</p>

          <div className="wizard-published-actions">
            <Link
              to={`/listings/${publishedSlug}`}
              className="wizard-btn wizard-btn--primary"
              data-testid="view-published-listing-btn"
            >
              {t('publicationProgress.openListing')}
            </Link>
            <button
              type="button"
              className="wizard-btn wizard-btn--secondary"
              onClick={onReset}
              data-testid="publish-another-btn"
            >
              {t('publicationProgress.publishAnother')}
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
          <h2 id="pub-error-heading">{t('publicationProgress.errorTitle')}</h2>
          <p className="wizard-step__subtitle">{error || t('publicationProgress.errorSubtitle')}</p>
          <div className="wizard-published-actions">
            <button
              type="button"
              className="wizard-btn wizard-btn--primary"
              onClick={onRetry}
              data-testid="publish-retry-btn"
            >
              {t('common.tryAgain')}
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
        <h2 id="pub-pending-heading">{t('publicationProgress.pendingTitle')}</h2>
        <p className="wizard-step__subtitle">{t('publicationProgress.pendingSubtitle')}</p>
      </div>
    </section>
  )
}
