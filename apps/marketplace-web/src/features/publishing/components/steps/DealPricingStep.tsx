import React, { FormEvent, useState } from 'react'
import type { DealFormData, DealType, CurrencyCode } from '../../model/types'

interface DealPricingStepProps {
  data: DealFormData
  onChange: (payload: Partial<DealFormData>) => void
  onBack: () => void
  onNext: () => Promise<void>
  isLoading: boolean
  error: string | null
}

const DEAL_TYPES: { type: DealType; label: string }[] = [
  { type: 'sale', label: 'Продажа' },
  { type: 'rent_long', label: 'Долгосрочная аренда' },
  { type: 'rent_short', label: 'Посуточная аренда' },
]

const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'GEL', label: 'GEL (₾)', symbol: '₾' },
  { code: 'RUB', label: 'RUB (₽)', symbol: '₽' },
]

export function DealPricingStep({
  data,
  onChange,
  onBack,
  onNext,
  isLoading,
  error,
}: DealPricingStepProps) {
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!data.priceAmount || Number(data.priceAmount) <= 0) {
      setValidationError('Укажите стоимость объекта')
      return
    }

    await onNext()
  }

  const selectedCurrency = CURRENCIES.find((c) => c.code === data.currency) || CURRENCIES[0]
  const formattedPrice = data.priceAmount
    ? `${selectedCurrency.symbol} ${Number(data.priceAmount).toLocaleString('ru-RU')}`
    : null

  return (
    <section className="wizard-step wizard-step--deal" data-testid="wizard-step-deal" aria-labelledby="deal-heading">
      <div className="wizard-step__header">
        <h2 id="deal-heading">Шаг 3: Тип сделки и стоимость</h2>
        <p className="wizard-step__subtitle">
          Выберите формат предложения (продажа или аренда) и укажите цену
        </p>
      </div>

      {(validationError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label>Тип сделки *</label>
          <div className="wizard-chips-group" role="group" aria-label="Тип сделки">
            {DEAL_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                className={`wizard-chip ${data.dealType === type ? 'is-active' : ''}`}
                onClick={() => onChange({ dealType: type })}
                data-testid={`deal-type-${type}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="wizard-form-grid">
          <div className="wizard-field">
            <label htmlFor="deal-price">Стоимость *</label>
            <input
              id="deal-price"
              type="number"
              min="1"
              step="1"
              value={data.priceAmount}
              onChange={(e) =>
                onChange({ priceAmount: e.target.value === '' ? '' : parseFloat(e.target.value) })
              }
              placeholder="Например, 85000"
              required
              data-testid="deal-input-price"
            />
          </div>

          <div className="wizard-field">
            <label htmlFor="deal-currency">Валюта *</label>
            <select
              id="deal-currency"
              value={data.currency}
              onChange={(e) => onChange({ currency: e.target.value as CurrencyCode })}
              data-testid="deal-select-currency"
            >
              {CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {formattedPrice && (
          <div className="wizard-price-preview">
            <span className="wizard-price-preview__label">Итоговая стоимость в объявлении:</span>
            <span className="wizard-price-preview__val" data-testid="deal-price-preview">
              {formattedPrice}
            </span>
          </div>
        )}

        <div className="wizard-actions">
          <button
            type="button"
            className="wizard-btn wizard-btn--secondary"
            onClick={onBack}
            disabled={isLoading}
            data-testid="deal-back-btn"
          >
            ← Назад
          </button>
          <button
            type="submit"
            className="wizard-btn wizard-btn--primary"
            disabled={isLoading}
            aria-busy={isLoading}
            data-testid="deal-next-btn"
          >
            {isLoading ? 'Создание предложения...' : 'Далее: Загрузка фото →'}
          </button>
        </div>
      </form>
    </section>
  )
}
