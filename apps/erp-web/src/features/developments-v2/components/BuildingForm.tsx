import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, getCreateIdempotencyKey, resetCreateIdempotencyKey, type BuildingV2 } from '@/services/developmentsApiV2'
import { extractErrorMessage } from '../lib/errorMessage'
import { labelStyle, inputStyle, fieldStyle } from '../lib/formStyles'

interface BuildingFormProps {
  developmentId: string
  onCreated: (building: BuildingV2) => void
  onCancel: () => void
}

type FieldErrors = Partial<Record<'name' | 'floorsCount', string>>

/** D-02 COMPLETE: минимальные поля Building — name/floorsCount/startDate?/completionDate?. */
export function BuildingForm({ developmentId, onCreated, onCancel }: BuildingFormProps) {
  /** Идентификатор текущей попытки создания — ключ идемпотентности. */
  const attemptRef = useRef<string>('')

  const [name, setName] = useState('')
  const [floorsCount, setFloorsCount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [completionDate, setCompletionDate] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Укажите название корпуса'
    const floorsCountNum = Number(floorsCount)
    if (!floorsCount.trim()) {
      errors.floorsCount = 'Укажите количество этажей'
    } else if (!Number.isInteger(floorsCountNum) || floorsCountNum < 1) {
      errors.floorsCount = 'Количество этажей должно быть целым числом больше 0'
    }
    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)
    setForbidden(false)

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      // Одна попытка = один ключ: повтор после сетевой ошибки уходит с тем же
      // ключом, иначе backend создаст вторую сущность (ADR-006).
      if (!attemptRef.current) attemptRef.current = `building-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const created = await developmentsApiV2.createBuilding(developmentId, {
        name: name.trim(),
        floorsCount: Number(floorsCount),
        startDate: startDate || undefined,
        completionDate: completionDate || undefined,
      }, getCreateIdempotencyKey(attemptRef.current))
      resetCreateIdempotencyKey(attemptRef.current)
      attemptRef.current = ''
      onCreated(created)
    } catch (err) {
      const { message, isForbidden } = extractErrorMessage(err, 'Не удалось создать корпус. Попробуйте ещё раз')
      setApiError(message)
      setForbidden(isForbidden)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {apiError && (
        <div
          data-testid={forbidden ? 'building-form-forbidden-banner' : 'building-form-api-error-banner'}
          className="rounded-md bg-[var(--green-card)] px-4 py-3 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="building-name">Название корпуса *</label>
          <input
            id="building-name"
            style={fieldStyle(Boolean(fieldErrors.name))}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Корпус 1"
          />
          {fieldErrors.name && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.name}</p>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="building-floorsCount">Этажей *</label>
          <input
            id="building-floorsCount"
            style={fieldStyle(Boolean(fieldErrors.floorsCount))}
            value={floorsCount}
            onChange={(e) => setFloorsCount(e.target.value)}
            placeholder="12"
            inputMode="numeric"
          />
          {fieldErrors.floorsCount && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.floorsCount}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="building-startDate">Старт строительства</label>
          <input id="building-startDate" type="date" style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="building-completionDate">Сдача</label>
          <input id="building-completionDate" type="date" style={inputStyle} value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Создание…' : 'Создать корпус'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-sm border border-[color:var(--green-border)] bg-transparent px-5 py-2.5 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[var(--green-card)] hover:text-[color:var(--app-text)] disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
    </form>
  )
}
