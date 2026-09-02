import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Loader2 } from 'lucide-react'
import {
  developmentsApiV2,
  getCreateIdempotencyKey,
  resetCreateIdempotencyKey,
  type CreateDevelopmentV2Payload,
  type DevelopmentV2,
} from '@/services/developmentsApiV2'
import { COUNTRY_OPTIONS } from '@/lib/project-options'
import { optionLabel } from '@/lib/project-options'
import { useI18n } from '@/i18n'

/**
 * D-02 (26.08.2026): узкий V2-визард создания и редактирования ЖК — пишет напрямую в НОВЫЙ
 * Development-агрегат (developmentsApiV2.create, apps/api D-01) по контракту
 * CreateDevelopmentDto (name/location{country,city,address?,geo}/contact{phone,
 * whatsapp?,telegram?}/classType?/startDate?/completionDate?/description?).
 *
 * НЕ путать с legacy ProjectWizardPage.tsx (десятки маркетинговых полей,
 * пишет в другой backend через developmentApi.ts) — эта страница подменяет
 * роуты dashboard/development/projects/new и dashboard/development/projects/:id/edit
 * (см. main.tsx), сам legacy-визард не трогается.
 */

type FieldErrors = Partial<Record<'name' | 'country' | 'city' | 'longitude' | 'latitude' | 'phone', string>>

const INITIAL_FORM = {
  name: '',
  countryCode: '',
  city: '',
  address: '',
  longitude: '',
  latitude: '',
  phone: '',
  whatsapp: '',
  telegram: '',
  classType: '',
  startDate: '',
  completionDate: '',
  description: '',
}

type FormState = typeof INITIAL_FORM

function formFromDevelopment(development: DevelopmentV2): FormState {
  return {
    name: development.name,
    countryCode: development.location.country,
    city: development.location.city,
    address: development.location.address ?? '',
    longitude: String(development.location.geo.coordinates[0]),
    latitude: String(development.location.geo.coordinates[1]),
    phone: development.contact.phone,
    whatsapp: development.contact.whatsapp ?? '',
    telegram: development.contact.telegram ?? '',
    classType: development.classType ?? '',
    startDate: development.startDate ?? '',
    completionDate: development.completionDate ?? '',
    description: development.description ?? '',
  }
}

const CLASS_TYPE_OPTIONS = ['econom', 'comfort', 'business', 'premium', 'elite'] as const

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--app-text-muted)',
  marginBottom: 6,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  height: 44,
  width: '100%',
  borderRadius: 4,
  border: 'none',
  borderBottom: '1px solid var(--green-border)',
  background: 'rgba(3,29,22,0.5)',
  color: 'var(--app-text)',
  fontSize: 16,
  padding: '0 12px',
  outline: 'none',
}

function fieldStyle(hasError: boolean): React.CSSProperties {
  return hasError ? { ...inputStyle, borderBottom: '1px solid #ffb4ab' } : inputStyle
}

/** Извлекает человекочитаемое сообщение из ответа AppException {error:{code,message,...}} или сетевой ошибки. */
function extractErrorMessage(err: unknown, action: 'создания' | 'редактирования' = 'создания'): { message: string; isForbidden: boolean } {
  const anyErr = err as { response?: { status?: number; data?: { error?: { message?: string }; message?: string } }; message?: string }
  const status = anyErr?.response?.status
  const backendMessage = anyErr?.response?.data?.error?.message ?? anyErr?.response?.data?.message
  if (status === 403) {
    return { message: backendMessage || `Недостаточно прав для ${action} ЖК`, isForbidden: true }
  }
  if (backendMessage) {
    return { message: backendMessage, isForbidden: false }
  }
  if (anyErr?.message) {
    return { message: anyErr.message, isForbidden: false }
  }
  return { message: 'Не удалось создать ЖК. Попробуйте ещё раз', isForbidden: false }
}

export function ProjectWizardV2Page() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { id: developmentId } = useParams<{ id: string }>()
  const isEditing = Boolean(developmentId)

  /** Идентификатор попытки создания ЖК — ключ идемпотентности. */
  const attemptRef = useRef<string>('')

  const [form, setForm] = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(isEditing)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null)

  useEffect(() => {
    if (!developmentId) {
      setLoading(false)
      setLoadFailed(false)
      setLoadedVersion(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    setApiError(null)
    setForbidden(false)
    setFieldErrors({})

    void developmentsApiV2.getById(developmentId)
      .then((development) => {
        if (cancelled) return
        setForm(formFromDevelopment(development))
        setLoadedVersion(development.version)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const { message, isForbidden } = extractErrorMessage(err, 'редактирования')
        setApiError(message)
        setForbidden(isForbidden)
        setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [developmentId])

  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find((c) => c.code === form.countryCode),
    [form.countryCode],
  )

  function set<K extends keyof typeof form>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value
      setForm((prev) => {
        // Смена страны сбрасывает выбранный город — города следующей
        // страны почти никогда не пересекаются с предыдущей.
        if (key === 'countryCode') return { ...prev, countryCode: value, city: '' }
        return { ...prev, [key]: value }
      })
    }
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!form.name.trim()) errors.name = 'Укажите название ЖК'
    if (!form.countryCode) errors.country = 'Страна обязательна для заполнения'
    if (!form.city) errors.city = 'Город обязателен для заполнения'

    const lng = Number(form.longitude)
    if (!form.longitude.trim()) {
      errors.longitude = 'Укажите долготу (longitude)'
    } else if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Долгота должна быть числом от -180 до 180'
    }

    const lat = Number(form.latitude)
    if (!form.latitude.trim()) {
      errors.latitude = 'Укажите широту (latitude)'
    } else if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Широта должна быть числом от -90 до 90'
    }

    if (!form.phone.trim()) errors.phone = 'Укажите телефон для связи'

    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError(null)
    setForbidden(false)

    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const payload: CreateDevelopmentV2Payload = {
      name: form.name.trim(),
      location: {
        country: form.countryCode,
        city: form.city,
        address: form.address.trim() || undefined,
        geo: {
          type: 'Point',
          // ADR-007: строго [longitude, latitude], не [lat, lng].
          coordinates: [Number(form.longitude), Number(form.latitude)],
        },
      },
      contact: {
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || undefined,
        telegram: form.telegram.trim() || undefined,
      },
      classType: form.classType || undefined,
      startDate: form.startDate || undefined,
      completionDate: form.completionDate || undefined,
      description: form.description.trim() || undefined,
    }

    setSubmitting(true)
    try {
      if (isEditing && developmentId && loadedVersion !== null) {
        const updated = await developmentsApiV2.update(developmentId, { ...payload, expectedVersion: loadedVersion })
        navigate('/dashboard/development/projects', { state: { updatedDevelopmentId: updated._id } })
      } else {
        // Одна попытка = один ключ: повтор после сетевой ошибки уходит с тем же
        // ключом, иначе backend создаст второй ЖК (ADR-006).
        if (!attemptRef.current) attemptRef.current = `development-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const created = await developmentsApiV2.create(payload, getCreateIdempotencyKey(attemptRef.current))
        resetCreateIdempotencyKey(attemptRef.current)
        attemptRef.current = ''
        navigate('/dashboard/development/projects', { state: { createdDevelopmentId: created._id } })
      }
    } catch (err) {
      const { message, isForbidden } = extractErrorMessage(err, isEditing ? 'редактирования' : 'создания')
      setApiError(message)
      setForbidden(isForbidden)
    } finally {
      setSubmitting(false)
    }
  }

  if (isEditing && loading) {
    return (
      <div className="felt-content flex flex-1 items-center justify-center min-h-0">
        <div className="flex items-center gap-3 text-[16px] text-[color:var(--app-text-muted)]" data-testid="wizard-loading">
          <Loader2 className="size-5 animate-spin" />
          Загружаем данные ЖК…
        </div>
      </div>
    )
  }

  if (isEditing && loadFailed) {
    return (
      <div className="felt-content flex flex-1 flex-col items-center justify-center gap-4 min-h-0 text-center">
        <div
          data-testid={forbidden ? 'wizard-forbidden-banner' : 'wizard-api-error-banner'}
          className="max-w-[520px] rounded-md bg-[var(--green-card)] px-5 py-4 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          {apiError}
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/development/projects')}
          className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-5 py-3 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[var(--green-card)] hover:text-[var(--app-text)]"
        >
          <ArrowLeft className="size-4" />
          Назад к объектам
        </button>
      </div>
    )
  }

  return (
    <div className="felt-content flex flex-1 flex-col gap-6 min-h-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/development/projects')}
          className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-4 py-2 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[var(--green-card)] hover:text-[color:var(--app-text)]"
        >
          <ArrowLeft className="size-4" />
          Назад к объектам
        </button>
        <h1 className="text-[30px] font-normal tracking-[-0.02em] text-[color:var(--app-text)]">
          {isEditing ? 'Редактирование ЖК' : 'Новый ЖК'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-[720px]">
        {forbidden && (
          <div
            data-testid="wizard-forbidden-banner"
            className="rounded-md bg-[var(--green-card)] px-5 py-4 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
          >
            {apiError}
          </div>
        )}
        {apiError && !forbidden && (
          <div
            data-testid="wizard-api-error-banner"
            className="rounded-md bg-[var(--green-card)] px-5 py-4 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
          >
            {apiError}
          </div>
        )}

        <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
          <h2 className="mb-4 text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">
            Основное
          </h2>
          <div className="grid gap-4">
            <div>
              <label style={labelStyle} htmlFor="name">Название ЖК *</label>
              <input
                id="name"
                style={fieldStyle(Boolean(fieldErrors.name))}
                value={form.name}
                onChange={set('name')}
                placeholder="ЖК Морской бриз"
              />
              {fieldErrors.name && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.name}</p>}
            </div>

            <div>
              <label style={labelStyle} htmlFor="classType">Класс</label>
              <select id="classType" style={inputStyle} value={form.classType} onChange={set('classType')}>
                <option value="">Не указан</option>
                {CLASS_TYPE_OPTIONS.map((c) => (
                  <option key={c} value={c}>{optionLabel(t, 'classTypes', c)}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="description">Описание</label>
              <textarea
                id="description"
                style={{ ...inputStyle, height: 96, padding: '10px 12px', resize: 'vertical' }}
                value={form.description}
                onChange={set('description')}
                placeholder="Коротко о проекте"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle} htmlFor="startDate">Старт строительства</label>
                <input id="startDate" type="date" style={inputStyle} value={form.startDate} onChange={set('startDate')} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="completionDate">Сдача</label>
                <input id="completionDate" type="date" style={inputStyle} value={form.completionDate} onChange={set('completionDate')} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
          <h2 className="mb-4 text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">
            Расположение
          </h2>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle} htmlFor="country">Страна *</label>
                <select id="country" style={fieldStyle(Boolean(fieldErrors.country))} value={form.countryCode} onChange={set('countryCode')}>
                  <option value="">Выберите страну</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{optionLabel(t, 'countries', c.code)}</option>
                  ))}
                </select>
                {fieldErrors.country && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.country}</p>}
              </div>
              <div>
                <label style={labelStyle} htmlFor="city">Город *</label>
                <select
                  id="city"
                  style={fieldStyle(Boolean(fieldErrors.city))}
                  value={form.city}
                  onChange={set('city')}
                  disabled={!selectedCountry}
                >
                  <option value="">{selectedCountry ? 'Выберите город' : 'Сначала выберите страну'}</option>
                  {selectedCountry?.cities.map((city) => (
                    <option key={city} value={city}>{optionLabel(t, 'cities', city)}</option>
                  ))}
                </select>
                {fieldErrors.city && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.city}</p>}
              </div>
            </div>

            <div>
              <label style={labelStyle} htmlFor="address">Адрес</label>
              <input
                id="address"
                style={inputStyle}
                value={form.address}
                onChange={set('address')}
                placeholder="Улица, дом"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle} htmlFor="longitude">Долгота (longitude) *</label>
                <input
                  id="longitude"
                  style={fieldStyle(Boolean(fieldErrors.longitude))}
                  value={form.longitude}
                  onChange={set('longitude')}
                  placeholder="41.6367"
                  inputMode="decimal"
                />
                {fieldErrors.longitude && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.longitude}</p>}
              </div>
              <div>
                <label style={labelStyle} htmlFor="latitude">Широта (latitude) *</label>
                <input
                  id="latitude"
                  style={fieldStyle(Boolean(fieldErrors.latitude))}
                  value={form.latitude}
                  onChange={set('latitude')}
                  placeholder="41.6459"
                  inputMode="decimal"
                />
                {fieldErrors.latitude && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.latitude}</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
          <h2 className="mb-4 text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">
            Контакты
          </h2>
          <div className="grid gap-4">
            <div>
              <label style={labelStyle} htmlFor="phone">Телефон *</label>
              <input
                id="phone"
                style={fieldStyle(Boolean(fieldErrors.phone))}
                value={form.phone}
                onChange={set('phone')}
                placeholder="+995 555 00 00 00"
              />
              {fieldErrors.phone && <p className="mt-1 text-[16px] text-[#ffb4ab]">{fieldErrors.phone}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle} htmlFor="whatsapp">WhatsApp</label>
                <input id="whatsapp" style={inputStyle} value={form.whatsapp} onChange={set('whatsapp')} placeholder="+995 555 00 00 00" />
              </div>
              <div>
                <label style={labelStyle} htmlFor="telegram">Telegram</label>
                <input id="telegram" style={inputStyle} value={form.telegram} onChange={set('telegram')} placeholder="@company" />
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-6 py-3 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting
              ? (isEditing ? 'Сохранение…' : 'Создание…')
              : (isEditing ? 'Сохранить изменения' : 'Создать ЖК')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/development/projects')}
            disabled={submitting}
            className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-6 py-3 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[var(--green-card)] hover:text-[color:var(--app-text)] disabled:opacity-60"
          >
            <Building2 className="size-4" />
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}
