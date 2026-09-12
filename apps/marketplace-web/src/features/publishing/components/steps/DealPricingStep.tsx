import React, { FormEvent, useState } from 'react'
import type { DealFormData, DealType, CurrencyCode } from '../../model/types'
import { useI18n } from '../../../../i18n'

interface DealPricingStepProps {
  data: DealFormData
  onChange: (payload: Partial<DealFormData>) => void
  onBack: () => void
  onNext: () => Promise<void>
  isLoading: boolean
  error: string | null
}

const DEAL_TYPES: { type: DealType; labelKey: string }[] = [
  { type: 'sale', labelKey: 'format.dealSale' },
  { type: 'rent_long', labelKey: 'format.dealRentLong' },
  { type: 'rent_short', labelKey: 'format.dealRentShort' },
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
  const { t } = useI18n()
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!data.priceAmount || Number(data.priceAmount) <= 0) {
      setValidationError(t('dealPricing.errorPrice'))
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
        <h2 id="deal-heading">{t('dealPricing.heading')}</h2>
        <p className="wizard-step__subtitle">{t('dealPricing.subtitle')}</p>
      </div>

      {(validationError || error) && (
        <div className="wizard-alert wizard-alert--error" role="alert">
          <span>{validationError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="wizard-form" noValidate>
        <div className="wizard-field">
          <label>{t('dealPricing.dealTypeLabel')}</label>
          <div className="wizard-chips-group" role="group" aria-label={t('filters.dealTypeAria')}>
            {DEAL_TYPES.map(({ type, labelKey }) => (
              <button
                key={type}
                type="button"
                className={`wizard-chip ${data.dealType === type ? 'is-active' : ''}`}
                onClick={() => onChange({ dealType: type })}
                data-testid={`deal-type-${type}`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="wizard-form-grid">
          <div className="wizard-field">
            <label htmlFor="deal-price">{t('dealPricing.priceLabel')}</label>
            <input
              id="deal-price"
              type="number"
              min="1"
              step="1"
              value={data.priceAmount}
              onChange={(e) =>
                onChange({ priceAmount: e.target.value === '' ? '' : parseFloat(e.target.value) })
              }
              placeholder={t('dealPricing.pricePlaceholder')}
              required
              data-testid="deal-input-price"
            />
          </div>

          <div className="wizard-field">
            <label htmlFor="deal-currency">{t('dealPricing.currencyLabel')}</label>
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
            <span className="wizard-price-preview__label">{t('dealPricing.previewLabel')}</span>
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
            {t('wizard.back')}
          </button>
          <button
            type="submit"
            className="wizard-btn wizard-btn--primary"
            disabled={isLoading}
            aria-busy={isLoading}
            data-testid="deal-next-btn"
          >
            {isLoading ? t('dealPricing.saving') : t('dealPricing.next')}
          </button>
        </div>
      </form>
    </section>
  )
}
