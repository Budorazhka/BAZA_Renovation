import React, { useState } from 'react'
import type {
  LocationFormData,
  CharacteristicsFormData,
  DealFormData,
  WizardMediaItem,
  DuplicateCandidate,
  ActualityState,
} from '../../model/types'
import { useI18n } from '../../../../i18n'
import { listingPropertyTypeLabel } from '../../../../lib/format'

interface ReviewDedupeStepProps {
  location: LocationFormData
  characteristics: CharacteristicsFormData
  deal: DealFormData
  mediaItems: WizardMediaItem[]
  duplicateCandidates: DuplicateCandidate[]
  hasDuplicateBlock: boolean
  overrideReason: string
  onOverrideReasonChange: (reason: string) => void
  onSubmitOverride: (duplicateCandidateId: string) => Promise<void>
  isSubmittingOverride: boolean
  actualityState?: ActualityState
  onBack: () => void
  onPublish: () => Promise<void>
  isPublishing: boolean
  error: string | null
}

export function ReviewDedupeStep({
  location,
  characteristics,
  deal,
  mediaItems,
  duplicateCandidates,
  hasDuplicateBlock,
  overrideReason,
  onOverrideReasonChange,
  onSubmitOverride,
  isSubmittingOverride,
  actualityState,
  onBack,
  onPublish,
  isPublishing,
  error,
}: ReviewDedupeStepProps) {
  const { t } = useI18n()
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const activeDuplicate = duplicateCandidates.find(
    (c) => c.status === 'detected' || c.status === 'confirmed_duplicate',
  )
  const canOverride = activeDuplicate?.status === 'detected'

  const handleOverrideSubmit = async () => {
    if (!activeDuplicate) return
    setOverrideError(null)

    if (!overrideReason || overrideReason.trim().length < 10) {
      setOverrideError(t('reviewDedupe.errorReason'))
      return
    }

    await onSubmitOverride(activeDuplicate.id)
  }

  return (
    <section className="wizard-step wizard-step--review" data-testid="wizard-step-review" aria-labelledby="review-heading">
      <div className="wizard-step__header">
        <h2 id="review-heading">{t('reviewDedupe.heading')}</h2>
        <p className="wizard-step__subtitle">{t('reviewDedupe.subtitle')}</p>
      </div>

      {error && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Duplicate detection warning card */}
      {hasDuplicateBlock && activeDuplicate && (
        <div className="wizard-alert wizard-alert--warning" role="region" aria-label={t('reviewDedupe.duplicateWarningAria')} data-testid="duplicate-warning-card">
          <div className="wizard-alert__title">{t('reviewDedupe.duplicateTitle')}</div>
          <p>
            {t('reviewDedupe.duplicateText', {
              phone: activeDuplicate.signals.phoneMatch ? t('reviewDedupe.phoneMatches') : '',
              address: activeDuplicate.signals.addressMatch ? t('reviewDedupe.addressMatches') : '',
            })}
          </p>
          {canOverride ? (
            <div className="wizard-override-box">
              <label htmlFor="override-reason">{t('reviewDedupe.overrideLabel')}</label>
              <textarea
                id="override-reason"
                rows={3}
                value={overrideReason}
                onChange={(e) => onOverrideReasonChange(e.target.value)}
                placeholder={t('reviewDedupe.overridePlaceholder')}
                disabled={isSubmittingOverride}
                data-testid="override-reason-input"
              />
              {overrideError && <p className="wizard-field-error">{overrideError}</p>}
              <button
                type="button"
                className="wizard-btn wizard-btn--warning"
                onClick={handleOverrideSubmit}
                disabled={isSubmittingOverride}
                aria-busy={isSubmittingOverride}
                data-testid="override-submit-btn"
              >
                {isSubmittingOverride ? t('reviewDedupe.overrideSending') : t('reviewDedupe.overrideSubmit')}
              </button>
            </div>
          ) : (
            <p className="wizard-field-hint" data-testid="duplicate-confirmed-hint">
              {t('reviewDedupe.confirmedHint')}
            </p>
          )}
        </div>
      )}

      {/* Summary Details */}
      <div className="wizard-summary-card">
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">{t('reviewDedupe.address')}</span>
          <strong>{location.city}, {location.address}</strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">{t('reviewDedupe.typeAndParams')}</span>
          <strong>
            {listingPropertyTypeLabel(characteristics.propertyType, characteristics.commercialSubtype, t)} · {t('card.area', { area: characteristics.area })}
            {characteristics.rooms ? `, ${t('card.rooms', { count: characteristics.rooms })}` : ''}
          </strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">{t('reviewDedupe.dealTerms')}</span>
          <strong>
            {deal.dealType === 'sale' ? t('format.dealSale') : t('editListing.rent')} — {deal.priceAmount} {deal.currency}
          </strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">{t('reviewDedupe.contacts')}</span>
          <strong>{characteristics.representativePhone}</strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">{t('reviewDedupe.uploadedPhotos')}</span>
          <strong>{t('reviewDedupe.photoCount', { count: mediaItems.length })}</strong>
        </div>
        {actualityState && (
          <div className="wizard-summary-row">
            <span className="wizard-summary-label">{t('reviewDedupe.actuality')}</span>
            <span className="wizard-badge wizard-badge--success">{t('reviewDedupe.readyToConfirm')}</span>
          </div>
        )}
      </div>

      <div className="wizard-actions">
        <button
          type="button"
          className="wizard-btn wizard-btn--secondary"
          onClick={onBack}
          disabled={isPublishing}
          data-testid="review-back-btn"
        >
          {t('wizard.back')}
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--success"
          onClick={onPublish}
          disabled={isPublishing || hasDuplicateBlock}
          aria-busy={isPublishing}
          data-testid="publish-submit-btn"
        >
          {isPublishing ? t('reviewDedupe.publishing') : t('reviewDedupe.publish')}
        </button>
      </div>
    </section>
  )
}
