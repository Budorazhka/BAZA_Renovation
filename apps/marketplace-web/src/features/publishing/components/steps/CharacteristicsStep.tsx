import React, { FormEvent, useState } from 'react'
import type { CharacteristicsFormData, PropertyType, CommercialSubtype } from '../../model/types'
import { useI18n } from '../../../../i18n'

interface CharacteristicsStepProps {
  data: CharacteristicsFormData
  onChange: (payload: Partial<CharacteristicsFormData>) => void
  onBack: () => void
  onNext: () => Promise<void>
  isLoading: boolean
  error: string | null
}

const PROPERTY_TYPES: { type: PropertyType; labelKey: string }[] = [
  { type: 'apartment', labelKey: 'filters.propertyType.apartment' },
  { type: 'house', labelKey: 'format.typeHouse' },
  { type: 'commercial', labelKey: 'filters.propertyType.commercial' },
  { type: 'land', labelKey: 'requests.kind.land' },
]

const COMMERCIAL_SUBTYPES: { subtype: CommercialSubtype; labelKey: string }[] = [
  { subtype: 'office', labelKey: 'filters.commercial.office' },
  { subtype: 'retail', labelKey: 'filters.commercial.retail' },
  { subtype: 'warehouse', labelKey: 'filters.commercial.warehouse' },
  { subtype: 'business', labelKey: 'filters.commercial.business' },
  { subtype: 'free_purpose', labelKey: 'filters.commercial.freePurpose' },
]

export function CharacteristicsStep({
  data,
  onChange,
  onBack,
  onNext,
  isLoading,
  error,
}: CharacteristicsStepProps) {
  const { t } = useI18n()
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!data.area || Number(data.area) <= 0) {
      setValidationError(t('characteristics.errorArea'))
      return
    }

    if (!data.representativePhone.trim()) {
      setValidationError(t('characteristics.errorPhone'))
      return
    }

    if (data.floor !== '' && data.totalFloors !== '' && Number(data.floor) > Number(data.totalFloors)) {
      setValidationError(t('characteristics.errorFloor'))
      return
    }

    await onNext()
  }

  return (
    <section className="wizard-step wizard-step--characteristics" data-testid="wizard-step-characteristics" aria-labelledby="char-heading">
      <div className="wizard-step__header">
        <h2 id="char-heading">{t('characteristics.heading')}</h2>
        <p className="wizard-step__subtitle">{t('characteristics.subtitle')}</p>
      </div>

      {(validationError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label>{t('characteristics.propertyTypeLabel')}</label>
          <div className="wizard-chips-group" role="group" aria-label={t('filters.propertyTypeAria')}>
            {PROPERTY_TYPES.map(({ type, labelKey }) => (
              <button
                key={type}
                type="button"
                className={`wizard-chip ${data.propertyType === type ? 'is-active' : ''}`}
                onClick={() => onChange({ propertyType: type, commercialSubtype: type === 'commercial' ? 'office' : undefined })}
                data-testid={`property-type-${type}`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        {data.propertyType === 'commercial' && (
          <div className="wizard-field">
            <label>{t('characteristics.commercialFormatLabel')}</label>
            <div className="wizard-chips-group" role="group" aria-label={t('filters.commercialAria')}>
              {COMMERCIAL_SUBTYPES.map(({ subtype, labelKey }) => (
                <button
                  key={subtype}
                  type="button"
                  className={`wizard-chip ${data.commercialSubtype === subtype ? 'is-active' : ''}`}
                  onClick={() => onChange({ commercialSubtype: subtype })}
                  data-testid={`commercial-subtype-${subtype}`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="wizard-form-grid">
          <div className="wizard-field">
            <label htmlFor="char-area">{t('characteristics.areaLabel')}</label>
            <input
              id="char-area"
              type="number"
              min="1"
              step="0.1"
              value={data.area}
              onChange={(e) => onChange({ area: e.target.value === '' ? '' : parseFloat(e.target.value) })}
              placeholder={t('characteristics.areaPlaceholder')}
              required
              data-testid="characteristics-input-area"
            />
          </div>

          {data.propertyType !== 'land' && (
            <div className="wizard-field">
              <label htmlFor="char-rooms">{t('characteristics.roomsLabel')}</label>
              <input
                id="char-rooms"
                type="number"
                min="0"
                step="1"
                value={data.rooms}
                onChange={(e) => onChange({ rooms: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                placeholder={t('characteristics.roomsPlaceholder')}
                data-testid="characteristics-input-rooms"
              />
            </div>
          )}
        </div>

        {data.propertyType !== 'land' && (
          <div className="wizard-form-grid">
            <div className="wizard-field">
              <label htmlFor="char-floor">{t('characteristics.floorLabel')}</label>
              <input
                id="char-floor"
                type="number"
                min="1"
                value={data.floor}
                onChange={(e) => onChange({ floor: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                placeholder="5"
                data-testid="characteristics-input-floor"
              />
            </div>

            <div className="wizard-field">
              <label htmlFor="char-total-floors">{t('characteristics.totalFloorsLabel')}</label>
              <input
                id="char-total-floors"
                type="number"
                min="1"
                value={data.totalFloors}
                onChange={(e) => onChange({ totalFloors: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                placeholder="12"
                data-testid="characteristics-input-total-floors"
              />
            </div>
          </div>
        )}

        <div className="wizard-field">
          <label htmlFor="char-phone">{t('characteristics.phoneLabel')}</label>
          <input
            id="char-phone"
            type="tel"
            autoComplete="tel"
            value={data.representativePhone}
            onChange={(e) => onChange({ representativePhone: e.target.value })}
            placeholder="+995 555 12 34 56"
            required
            data-testid="characteristics-input-phone"
          />
          <p className="wizard-field-hint">{t('characteristics.phoneHint')}</p>
        </div>

        <div className="wizard-actions">
          <button
            type="button"
            className="wizard-btn wizard-btn--secondary"
            onClick={onBack}
            disabled={isLoading}
            data-testid="characteristics-back-btn"
          >
            {t('wizard.back')}
          </button>
          <button
            type="submit"
            className="wizard-btn wizard-btn--primary"
            disabled={isLoading}
            aria-busy={isLoading}
            data-testid="characteristics-next-btn"
          >
            {isLoading ? t('characteristics.saving') : t('characteristics.next')}
          </button>
        </div>
      </form>
    </section>
  )
}
