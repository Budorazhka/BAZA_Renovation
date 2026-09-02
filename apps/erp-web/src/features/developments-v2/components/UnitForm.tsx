import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, getCreateIdempotencyKey, resetCreateIdempotencyKey, type FloorPlanV2, type FloorV2, type UnitKindV2, type UnitV2, type MoneyCurrency } from '@/services/developmentsApiV2'
import { extractErrorMessage } from '../lib/errorMessage'
import { labelStyle, inputStyle, fieldStyle } from '../lib/formStyles'
import { UNIT_KIND_LABEL, UNIT_KIND_OPTIONS, MONEY_CURRENCY_OPTIONS, MONEY_CURRENCY_LABEL } from '../constants'

interface UnitFormProps {
  buildingId: string
  floors: FloorV2[]
  floorPlans: FloorPlanV2[]
  onCreated: (unit: UnitV2) => void
  onCancel: () => void
}

type FieldErrors = Partial<Record<'number' | 'floorId' | 'area' | 'amountMinorUnits', string>>

/**
 * D-02 COMPLETE: Unit — самая большая форма. price.amountMinorUnits вводится
 * ЯВНО как целое число минимальных единиц (не десятичный доллары/лари с
 * автоконвертацией) — полностью исключает float-арифметику округления, не
 * просто проверяет её результат постфактум. См. parseMinorUnitsInput ниже.
 */
function parseMinorUnitsInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return null
  return value
}

export function UnitForm({ buildingId, floors, floorPlans, onCreated, onCancel }: UnitFormProps) {
  /** Идентификатор текущей попытки создания — ключ идемпотентности. */
  const attemptRef = useRef<string>('')

  const [number, setNumber] = useState('')
  const [kind, setKind] = useState<UnitKindV2>('apartment')
  const [floorId, setFloorId] = useState('')
  const [rooms, setRooms] = useState('')
  const [area, setArea] = useState('')
  const [areaLiving, setAreaLiving] = useState('')
  const [areaBalcony, setAreaBalcony] = useState('')
  const [amountMinorUnits, setAmountMinorUnits] = useState('')
  const [currency, setCurrency] = useState<MoneyCurrency>('USD')
  const [floorPlanId, setFloorPlanId] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!number.trim()) errors.number = 'Укажите номер юнита'
    if (!floorId) errors.floorId = 'Выберите этаж'

    const areaNum = Number(area)
    if (!area.trim()) {
      errors.area = 'Укажите площадь'
    } else if (!Number.isFinite(areaNum) || areaNum <= 0) {
      errors.area = 'Площадь должна быть числом больше 0'
    }

    if (parseMinorUnitsInput(amountMinorUnits) === null) {
      errors.amountMinorUnits = 'Введите целое число минимальных единиц, например 10000000 для $100 000.00'
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

    const parsedAmount = parseMinorUnitsInput(amountMinorUnits)
    if (parsedAmount === null) return // защита типов — validate() уже отсёк этот случай выше

    setSubmitting(true)
    try {
      // Одна попытка = один ключ: повтор после сетевой ошибки уходит с тем же
      // ключом, иначе backend создаст вторую сущность (ADR-006).
      if (!attemptRef.current) attemptRef.current = `unit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const created = await developmentsApiV2.createUnit(floorId, buildingId, {
        number: number.trim(),
        kind,
        rooms: rooms.trim() ? Number(rooms) : undefined,
        area: Number(area),
        areaLiving: areaLiving.trim() ? Number(areaLiving) : undefined,
        areaBalcony: areaBalcony.trim() ? Number(areaBalcony) : undefined,
        price: { amountMinorUnits: parsedAmount, currency },
        floorPlanId: floorPlanId || undefined,
      }, getCreateIdempotencyKey(attemptRef.current))
      resetCreateIdempotencyKey(attemptRef.current)
      attemptRef.current = ''
      onCreated(created)
    } catch (err) {
      const { message, isForbidden } = extractErrorMessage(err, 'Не удалось создать юнит. Попробуйте ещё раз')
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
          data-testid={forbidden ? 'unit-form-forbidden-banner' : 'unit-form-api-error-banner'}
          className="rounded-md bg-[var(--green-card)] px-4 py-3 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="unit-number">Номер юнита *</label>
          <input
            id="unit-number"
            style={fieldStyle(Boolean(fieldErrors.number))}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="101"
          />
          {fieldErrors.number && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.number}</p>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-kind">Тип *</label>
          <select id="unit-kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as UnitKindV2)}>
            {UNIT_KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>{UNIT_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle} htmlFor="unit-floor">Этаж *</label>
        <select id="unit-floor" style={fieldStyle(Boolean(fieldErrors.floorId))} value={floorId} onChange={(e) => setFloorId(e.target.value)}>
          <option value="">Выберите этаж</option>
          {floors.map((f) => (
            <option key={f._id} value={f._id}>Этаж {f.floorNumber}</option>
          ))}
        </select>
        {fieldErrors.floorId && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.floorId}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label style={labelStyle} htmlFor="unit-rooms">Комнат</label>
          <input id="unit-rooms" style={inputStyle} value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="2" inputMode="numeric" />
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-area">Площадь, м² *</label>
          <input
            id="unit-area"
            style={fieldStyle(Boolean(fieldErrors.area))}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="45"
            inputMode="decimal"
          />
          {fieldErrors.area && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.area}</p>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-floorPlan">Планировка</label>
          <select id="unit-floorPlan" style={inputStyle} value={floorPlanId} onChange={(e) => setFloorPlanId(e.target.value)}>
            <option value="">Без планировки</option>
            {floorPlans.map((fp) => (
              <option key={fp._id} value={fp._id}>{fp.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="unit-areaLiving">Жилая площадь, м²</label>
          <input id="unit-areaLiving" style={inputStyle} value={areaLiving} onChange={(e) => setAreaLiving(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-areaBalcony">Площадь балкона, м²</label>
          <input id="unit-areaBalcony" style={inputStyle} value={areaBalcony} onChange={(e) => setAreaBalcony(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={labelStyle} htmlFor="unit-price">Цена (в минимальных единицах — центы/тетри/копейки) *</label>
          <input
            id="unit-price"
            style={fieldStyle(Boolean(fieldErrors.amountMinorUnits))}
            value={amountMinorUnits}
            onChange={(e) => setAmountMinorUnits(e.target.value)}
            placeholder="10000000 = $100 000.00"
            inputMode="numeric"
          />
          {fieldErrors.amountMinorUnits && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.amountMinorUnits}</p>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-currency">Валюта *</label>
          <select id="unit-currency" style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value as MoneyCurrency)}>
            {MONEY_CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>{MONEY_CURRENCY_LABEL[c]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Создание…' : 'Создать юнит'}
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
