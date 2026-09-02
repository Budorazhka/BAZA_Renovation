import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { developmentsApiV2, getCreateIdempotencyKey, resetCreateIdempotencyKey, type SectionV2 } from '@/services/developmentsApiV2'
import { extractErrorMessage } from '../lib/errorMessage'
import { labelStyle, fieldStyle } from '../lib/formStyles'

interface SectionFormProps {
  buildingId: string
  onCreated: (section: SectionV2) => void
  onCancel: () => void
}

/** D-02 COMPLETE: Section — единственное поле name, опциональна для юнита. */
export function SectionForm({ buildingId, onCreated, onCancel }: SectionFormProps) {
  /** Идентификатор текущей попытки создания — ключ идемпотентности. */
  const attemptRef = useRef<string>('')

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)
    setForbidden(false)

    if (!name.trim()) {
      setNameError('Укажите название секции')
      return
    }
    setNameError(null)

    setSubmitting(true)
    try {
      // Одна попытка = один ключ: повтор после сетевой ошибки уходит с тем же
      // ключом, иначе backend создаст вторую сущность (ADR-006).
      if (!attemptRef.current) attemptRef.current = `section-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const created = await developmentsApiV2.createSection(buildingId, { name: name.trim() }, getCreateIdempotencyKey(attemptRef.current))
      resetCreateIdempotencyKey(attemptRef.current)
      attemptRef.current = ''
      onCreated(created)
    } catch (err) {
      const { message, isForbidden } = extractErrorMessage(err, 'Не удалось создать секцию. Попробуйте ещё раз')
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
          data-testid={forbidden ? 'section-form-forbidden-banner' : 'section-form-api-error-banner'}
          className="rounded-md bg-[var(--green-card)] px-4 py-3 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          {apiError}
        </div>
      )}

      <div>
        <label style={labelStyle} htmlFor="section-name">Название секции *</label>
        <input
          id="section-name"
          style={fieldStyle(Boolean(nameError))}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Секция А"
        />
        {nameError && <p className="mt-1 text-[16px] text-[#ffb4ab]">{nameError}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? 'Создание…' : 'Создать секцию'}
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
