import React, { useState } from 'react'
import type {
  LocationFormData,
  CharacteristicsFormData,
  DealFormData,
  WizardMediaItem,
  DuplicateCandidate,
  ActualityState,
} from '../../model/types'

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
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const activeDuplicate = duplicateCandidates.find((c) => c.status === 'detected')

  const handleOverrideSubmit = async () => {
    if (!activeDuplicate) return
    setOverrideError(null)

    if (!overrideReason || overrideReason.trim().length < 10) {
      setOverrideError('Укажите причину подтверждения (не менее 10 символов)')
      return
    }

    await onSubmitOverride(activeDuplicate.id)
  }

  return (
    <section className="wizard-step wizard-step--review" data-testid="wizard-step-review" aria-labelledby="review-heading">
      <div className="wizard-step__header">
        <h2 id="review-heading">Шаг 5: Проверка данных и публикация</h2>
        <p className="wizard-step__subtitle">
          Убедитесь в корректности параметров объявления перед отправкой в каталог маркетплейса
        </p>
      </div>

      {error && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Duplicate detection warning card */}
      {hasDuplicateBlock && activeDuplicate && (
        <div className="wizard-alert wizard-alert--warning" role="region" aria-label="Предупреждение о дубликате" data-testid="duplicate-warning-card">
          <div className="wizard-alert__title">
            ⚠️ Обнаружен возможный дубликат объекта
          </div>
          <p>
            Система BAZA нашла совпадение по контактам или адресу ({activeDuplicate.signals.phoneMatch ? 'телефон совпадает' : ''}{' '}
            {activeDuplicate.signals.addressMatch ? 'адрес совпадает' : ''}).
          </p>
          <div className="wizard-override-box">
            <label htmlFor="override-reason">
              Если это отдельный объект или эксклюзивное право, подтвердите отсутствие дубликата (не менее 10 символов) *:
            </label>
            <textarea
              id="override-reason"
              rows={3}
              value={overrideReason}
              onChange={(e) => onOverrideReasonChange(e.target.value)}
              placeholder="Я подтверждаю, что являюсь официальным представителем и это реальный уникальный объект..."
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
              {isSubmittingOverride ? 'Отправка...' : 'Подтвердить, что это не дубль'}
            </button>
          </div>
        </div>
      )}

      {/* Summary Details */}
      <div className="wizard-summary-card">
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">Адрес:</span>
          <strong>{location.city}, {location.address}</strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">Тип и параметры:</span>
          <strong>
            {characteristics.propertyType} · {characteristics.area} м²
            {characteristics.rooms ? `, ${characteristics.rooms} комн.` : ''}
          </strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">Условия сделки:</span>
          <strong>
            {deal.dealType === 'sale' ? 'Продажа' : 'Аренда'} — {deal.priceAmount} {deal.currency}
          </strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">Контакты:</span>
          <strong>{characteristics.representativePhone}</strong>
        </div>
        <div className="wizard-summary-row">
          <span className="wizard-summary-label">Загружено фото:</span>
          <strong>{mediaItems.length} фото</strong>
        </div>
        {actualityState && (
          <div className="wizard-summary-row">
            <span className="wizard-summary-label">Актуальность:</span>
            <span className="wizard-badge wizard-badge--success">Готово к подтверждению</span>
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
          ← Назад
        </button>
        <button
          type="button"
          className="wizard-btn wizard-btn--success"
          onClick={onPublish}
          disabled={isPublishing || hasDuplicateBlock}
          aria-busy={isPublishing}
          data-testid="publish-submit-btn"
        >
          {isPublishing ? 'Отправка публикации...' : '🚀 Опубликовать объявление'}
        </button>
      </div>
    </section>
  )
}
