import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, type UnitStatusV2, type UnitV2 } from '@/services/developmentsApiV2'
import { extractErrorMessage, type ExtractedError } from '../lib/errorMessage'
import { UNIT_STATUS_LABEL, UNIT_STATUS_OPTIONS } from '../constants'

interface UnitStatusControlProps {
  unit: UnitV2
  onUpdated: (updated: UnitV2) => void
}

/** D-02 COMPLETE: смена статуса Unit — expectedVersion обязателен, version conflict с кнопкой «обновить данные». */
export function UnitStatusControl({ unit, onUpdated }: UnitStatusControlProps) {
  const [nextStatus, setNextStatus] = useState<UnitStatusV2>(unit.status)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<ExtractedError | null>(null)

  async function handleSubmit() {
    if (nextStatus === unit.status) return
    setSubmitting(true)
    setLocalError(null)
    try {
      const updated = await developmentsApiV2.updateUnitStatus(unit._id, unit.version, nextStatus)
      onUpdated(updated)
    } catch (err) {
      setLocalError(extractErrorMessage(err, 'Не удалось изменить статус юнита'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRefresh() {
    const fresh = await developmentsApiV2.getUnit(unit._id)
    onUpdated(fresh)
    setNextStatus(fresh.status)
    setLocalError(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as UnitStatusV2)}
          className="h-9 rounded-sm border-none bg-[rgba(3,29,22,0.5)] px-2 text-[16px] text-[color:var(--app-text)] outline-none"
        >
          {UNIT_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{UNIT_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || nextStatus === unit.status}
          className="flex items-center gap-1.5 rounded-sm bg-[var(--gold)] px-3 py-1.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-50"
        >
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          Сохранить
        </button>
      </div>

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
        <div data-testid="unit-status-error-banner" className="rounded-sm bg-[rgba(255,180,171,0.1)] px-3 py-2 text-[16px] text-[#ffb4ab]">
          {localError.message}
        </div>
      )}
    </div>
  )
}
