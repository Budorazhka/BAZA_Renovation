import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, getCreateIdempotencyKey, resetCreateIdempotencyKey, type FloorPlanV2 } from '@/services/developmentsApiV2'
import { extractErrorMessage } from '../lib/errorMessage'
import { labelStyle, inputStyle, fieldStyle } from '../lib/formStyles'

interface FloorPlanFormProps {
  buildingId: string
  onCreated: (floorPlan: FloorPlanV2) => void
  onCancel: () => void
}

type FieldErrors = Partial<Record<'name' | 'rooms' | 'area', string>>

/** D-02 COMPLETE: FloorPlan — name/rooms/area(required)/isEuro?/tags?. */
export function FloorPlanForm({ buildingId, onCreated, onCancel }: FloorPlanFormProps) {
  /** Идентификатор текущей попытки создания — ключ идемпотентности. */
  const attemptRef = useRef<string>('')

  const [name, setName] = useState('')
  const [rooms, setRooms] = useState('')
  const [area, setArea] = useState('')
  const [isEuro, setIsEuro] = useState(false)
  const [tagsInput, setTagsInput] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Укажите название планировки'

    const roomsNum = Number(rooms)
    if (!rooms.trim()) {
      errors.rooms = 'Укажите количество комнат'
    } else if (!Number.isInteger(roomsNum) || roomsNum < 0) {
      errors.rooms = 'Количество комнат должно быть целым числом ≥ 0'
    }

    const areaNum = Number(area)
    if (!area.trim()) {
      errors.area = 'Укажите площадь'
    } else if (!Number.isFinite(areaNum) || areaNum <= 0) {
      errors.area = 'Площадь должна быть числом больше 0'
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

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    setSubmitting(true)
    try {
      // Одна попытка = один ключ: повтор после сетевой ошибки уходит с тем же
      // ключом, иначе backend создаст вторую сущность (ADR-006).
      if (!attemptRef.current) attemptRef.current = `floorPlan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const created = await developmentsApiV2.createFloorPlan(buildingId, {
        name: name.trim(),
        rooms: Number(rooms),
        area: Number(area),
        isEuro: isEuro || undefined,
        tags: tags.length > 0 ? tags : undefined,
      }, getCreateIdempotencyKey(attemptRef.current))
      resetCreateIdempotencyKey(attemptRef.current)
      attemptRef.current = ''
      onCreated(created)
    } catch (err) {
      const { message, isForbidden } = extractErrorMessage(err, 'Не удалось создать планировку. Попробуйте ещё раз')
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
          data-testid={forbidden ? 'floorplan-form-forbidden-banner' : 'floorplan-form-api-error-banner'}
          className="rounded-md bg-[var(--green-card)] px-4 py-3 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          {apiError}
        </div>
      )}

      <div>
        <label style={labelStyle} htmlFor="floorplan-name">Название планировки *</label>
        <input
          id="floorplan-name"
          style={fieldStyle(Boolean(fieldErrors.name))}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Планировка 2+1"
        />
        {fieldErrors.name && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="floorplan-rooms">Комнат *</label>
          <input
            id="floorplan-rooms"
            style={fieldStyle(Boolean(fieldErrors.rooms))}
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
            placeholder="2"
            inputMode="numeric"
          />
          {fieldErrors.rooms && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.rooms}</p>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="floorplan-area">Площадь, м² *</label>
          <input
            id="floorplan-area"
            style={fieldStyle(Boolean(fieldErrors.area))}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="55"
            inputMode="decimal"
          />
          {fieldErrors.area && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.area}</p>}
        </div>
      </div>

      <div>
        <label style={labelStyle} htmlFor="floorplan-tags">Теги (через запятую)</label>
        <input
          id="floorplan-tags"
          style={inputStyle}
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="угловая, вид на море"
        />
      </div>

      <label className="flex items-center gap-2 text-[16px] font-normal text-[color:var(--app-text)]">
        <input type="checkbox" checked={isEuro} onChange={(e) => setIsEuro(e.target.checked)} />
        Евро-планировка
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Создание…' : 'Создать планировку'}
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
