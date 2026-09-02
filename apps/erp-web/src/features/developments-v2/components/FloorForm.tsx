import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, getCreateIdempotencyKey, resetCreateIdempotencyKey, type FloorV2, type SectionV2 } from '@/services/developmentsApiV2'
import { extractErrorMessage } from '../lib/errorMessage'
import { labelStyle, inputStyle, fieldStyle } from '../lib/formStyles'

interface FloorFormProps {
  buildingId: string
  sections: SectionV2[]
  onCreated: (floor: FloorV2) => void
  onCancel: () => void
}

type FieldErrors = Partial<Record<'floorNumber', string>>

/** D-02 COMPLETE: Floor — floorNumber(required)/sectionId?(select из sections)/floorType?. */
export function FloorForm({ buildingId, sections, onCreated, onCancel }: FloorFormProps) {
  /** Идентификатор текущей попытки создания — ключ идемпотентности. */
  const attemptRef = useRef<string>('')

  const [floorNumber, setFloorNumber] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [floorType, setFloorType] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    const floorNumberNum = Number(floorNumber)
    if (!floorNumber.trim()) {
      errors.floorNumber = 'Укажите номер этажа'
    } else if (!Number.isInteger(floorNumberNum)) {
      errors.floorNumber = 'Номер этажа должен быть целым числом'
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
      if (!attemptRef.current) attemptRef.current = `floor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const created = await developmentsApiV2.createFloor(buildingId, {
        floorNumber: Number(floorNumber),
        sectionId: sectionId || undefined,
        floorType: floorType.trim() || undefined,
      }, getCreateIdempotencyKey(attemptRef.current))
      resetCreateIdempotencyKey(attemptRef.current)
      attemptRef.current = ''
      onCreated(created)
    } catch (err) {
      const { message, isForbidden } = extractErrorMessage(err, 'Не удалось создать этаж. Попробуйте ещё раз')
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
          data-testid={forbidden ? 'floor-form-forbidden-banner' : 'floor-form-api-error-banner'}
          className="rounded-md bg-[var(--green-card)] px-4 py-3 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="floor-number">Номер этажа *</label>
          <input
            id="floor-number"
            style={fieldStyle(Boolean(fieldErrors.floorNumber))}
            value={floorNumber}
            onChange={(e) => setFloorNumber(e.target.value)}
            placeholder="1"
            inputMode="numeric"
          />
          {fieldErrors.floorNumber && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.floorNumber}</p>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="floor-section">Секция</label>
          <select id="floor-section" style={inputStyle} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Без секции</option>
            {sections.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle} htmlFor="floor-type">Тип этажа</label>
        <input
          id="floor-type"
          style={inputStyle}
          value={floorType}
          onChange={(e) => setFloorType(e.target.value)}
          placeholder="Жилой / технический / паркинг"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Создание…' : 'Создать этаж'}
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
