import React, { FormEvent, useState } from 'react'
import type { CharacteristicsFormData, PropertyType, CommercialSubtype } from '../../model/types'

interface CharacteristicsStepProps {
  data: CharacteristicsFormData
  onChange: (payload: Partial<CharacteristicsFormData>) => void
  onBack: () => void
  onNext: () => Promise<void>
  isLoading: boolean
  error: string | null
}

const PROPERTY_TYPES: { type: PropertyType; label: string }[] = [
  { type: 'apartment', label: 'Квартира' },
  { type: 'house', label: 'Дом / Коттедж' },
  { type: 'commercial', label: 'Коммерческая' },
  { type: 'land', label: 'Земельный участок' },
]

const COMMERCIAL_SUBTYPES: { subtype: CommercialSubtype; label: string }[] = [
  { subtype: 'office', label: 'Офис' },
  { subtype: 'retail', label: 'Торговая площадь' },
  { subtype: 'warehouse', label: 'Склад' },
  { subtype: 'business', label: 'Готовый бизнес' },
  { subtype: 'free_purpose', label: 'Свободное назначение' },
]

export function CharacteristicsStep({
  data,
  onChange,
  onBack,
  onNext,
  isLoading,
  error,
}: CharacteristicsStepProps) {
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!data.area || Number(data.area) <= 0) {
      setValidationError('Укажите корректную площадь объекта (м²)')
      return
    }

    if (!data.representativePhone.trim()) {
      setValidationError('Укажите контактный телефон представителя (+995...)')
      return
    }

    if (data.floor !== '' && data.totalFloors !== '' && Number(data.floor) > Number(data.totalFloors)) {
      setValidationError('Этаж не может быть выше этажности здания')
      return
    }

    await onNext()
  }

  return (
    <section className="wizard-step wizard-step--characteristics" data-testid="wizard-step-characteristics" aria-labelledby="char-heading">
      <div className="wizard-step__header">
        <h2 id="char-heading">Шаг 2: Характеристики объекта</h2>
        <p className="wizard-step__subtitle">
          Заполните параметры объекта недвижимости и телефон для связи с покупателями
        </p>
      </div>

      {(validationError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label>Тип недвижимости *</label>
          <div className="wizard-chips-group" role="group" aria-label="Тип недвижимости">
            {PROPERTY_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                className={`wizard-chip ${data.propertyType === type ? 'is-active' : ''}`}
                onClick={() => onChange({ propertyType: type, commercialSubtype: type === 'commercial' ? 'office' : undefined })}
                data-testid={`property-type-${type}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {data.propertyType === 'commercial' && (
          <div className="wizard-field">
            <label>Формат коммерческого помещения</label>
            <div className="wizard-chips-group" role="group" aria-label="Формат коммерции">
              {COMMERCIAL_SUBTYPES.map(({ subtype, label }) => (
                <button
                  key={subtype}
                  type="button"
                  className={`wizard-chip ${data.commercialSubtype === subtype ? 'is-active' : ''}`}
                  onClick={() => onChange({ commercialSubtype: subtype })}
                  data-testid={`commercial-subtype-${subtype}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="wizard-form-grid">
          <div className="wizard-field">
            <label htmlFor="char-area">Общая площадь (м²) *</label>
            <input
              id="char-area"
              type="number"
              min="1"
              step="0.1"
              value={data.area}
              onChange={(e) => onChange({ area: e.target.value === '' ? '' : parseFloat(e.target.value) })}
              placeholder="Например, 65"
              required
              data-testid="characteristics-input-area"
            />
          </div>

          {data.propertyType !== 'land' && (
            <div className="wizard-field">
              <label htmlFor="char-rooms">Количество комнат</label>
              <input
                id="char-rooms"
                type="number"
                min="0"
                step="1"
                value={data.rooms}
                onChange={(e) => onChange({ rooms: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                placeholder="Например, 2"
                data-testid="characteristics-input-rooms"
              />
            </div>
          )}
        </div>

        {data.propertyType !== 'land' && (
          <div className="wizard-form-grid">
            <div className="wizard-field">
              <label htmlFor="char-floor">Этаж</label>
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
              <label htmlFor="char-total-floors">Всего этажей в здании</label>
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
          <label htmlFor="char-phone">Телефон представителя *</label>
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
          <p className="wizard-field-hint">
            Телефон используется для связи с клиентами и проверки на дубликаты
          </p>
        </div>

        <div className="wizard-actions">
          <button
            type="button"
            className="wizard-btn wizard-btn--secondary"
            onClick={onBack}
            disabled={isLoading}
            data-testid="characteristics-back-btn"
          >
            ← Назад
          </button>
          <button
            type="submit"
            className="wizard-btn wizard-btn--primary"
            disabled={isLoading}
            aria-busy={isLoading}
            data-testid="characteristics-next-btn"
          >
            {isLoading ? 'Сохранение объекта...' : 'Далее: Условия сделки →'}
          </button>
        </div>
      </form>
    </section>
  )
}
