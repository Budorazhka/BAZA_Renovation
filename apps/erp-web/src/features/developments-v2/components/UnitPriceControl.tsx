import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, type MoneyCurrency, type UnitV2 } from '@/services/developmentsApiV2'
import { extractErrorMessage, type ExtractedError } from '../lib/errorMessage'
import { MONEY_CURRENCY_LABEL, MONEY_CURRENCY_OPTIONS } from '../constants'

interface UnitPriceControlProps {
  unit: UnitV2
  onUpdated: (updated: UnitV2) => void
}

function parseMinorUnitsInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return null
  return value
}

/** D-02 COMPLETE: смена цены Unit — expectedVersion обязателен, version conflict с кнопкой «обновить данные». */
export function UnitPriceControl({ unit, onUpdated }: UnitPriceControlProps) {
  const [amountMinorUnits, setAmountMinorUnits] = useState(String(unit.price.amountMinorUnits))
  const [currency, setCurrency] = useState<MoneyCurrency>(unit.price.currency)
  const [inputError, setInputError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<ExtractedError | null>(null)

  async function handleSubmit() {
    const parsed = parseMinorUnitsInput(amountMinorUnits)
    if (parsed === null) {
      setInputError('Введите целое число минимальных единиц, например 10000000 для $100 000.00')
      return
    }
    setInputError(null)
    setSubmitting(true)
    setLocalError(null)
    try {
      const updated = await developmentsApiV2.updateUnitPrice(unit._id, unit.version, { amountMinorUnits: parsed, currency })
      onUpdated(updated)
    } catch (err) {
      setLocalError(extractErrorMessage(err, 'Не удалось изменить цену юнита'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRefresh() {
    const fresh = await developmentsApiV2.getUnit(unit._id)
    onUpdated(fresh)
    setAmountMinorUnits(String(fresh.price.amountMinorUnits))
    setCurrency(fresh.price.currency)
    setLocalError(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={amountMinorUnits}
          onChange={(e) => setAmountMinorUnits(e.target.value)}
          placeholder="в минимальных единицах"
          inputMode="numeric"
          className="h-9 w-40 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as MoneyCurrency)}
          className="h-9 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
        >
          {MONEY_CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>{MONEY_CURRENCY_LABEL[c]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-sm bg-[var(--gold)] px-3 py-1.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-50"
        >
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          Сохранить
        </button>
      </div>

      {inputError && (
        <div data-testid="unit-price-validation-error" className="text-[16px] text-[#ffb4ab]">
          {inputError}
        </div>
      )}

      {localError?.isVersionConflict && (
        <div
          data-testid="unit-version-conflict-banner"
          className="flex items-center justify-between gap-3 rounded-sm bg-[rgba(255,180,171,0.1)] px-3 py-2 text-[16px] text-[#ffb4ab]"
        >
          <span>{localError.message}</span>
          <button type="button" onClick={() => void handleRefresh()} className="shrink-0 underline hover:no-underline">
            Обновить данные
          </button>
        </div>
      )}
      {localError && !localError.isVersionConflict && (
        <div data-testid="unit-price-error-banner" className="rounded-sm bg-[rgba(255,180,171,0.1)] px-3 py-2 text-[16px] text-[#ffb4ab]">
          {localError.message}
        </div>
      )}
    </div>
  )
}
