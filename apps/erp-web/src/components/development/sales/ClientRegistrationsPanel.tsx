import { useEffect, useState } from 'react'
import { Plus, User, X } from 'lucide-react'

import type { IProject } from '@/types/core'
import { developmentApi, type SalesClient } from '@/services/developmentApi'
import { useI18n } from '@/i18n'

export type ClientReservationStatus = 'active' | 'expired'

/** Строка таблицы; данные живут в коллекции `development-sales-clients` на API. */
export interface ClientRegistrationRow {
  id: string
  projectId: string
  clientName: string
  clientPhone: string
  realtorName: string
  agency: string
  createdAt: string
  comment: string
  /** Срок резерва клиента за риэлтором (API: createdAt + 6 месяцев). */
  reservedUntil: string
}

export function reservationStatus(row: ClientRegistrationRow): ClientReservationStatus {
  return new Date(row.reservedUntil).getTime() < Date.now() ? 'expired' : 'active'
}

// Скрываем последние 3 цифры
function maskPhone(phone: string): string {
  if (phone.length <= 3) return phone
  return phone.slice(0, -3) + '***'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

function toRow(sc: SalesClient): ClientRegistrationRow {
  return {
    id: sc.id,
    projectId: sc.complexId,
    clientName: sc.clientName,
    clientPhone: sc.clientPhone,
    realtorName: sc.realtorName,
    agency: sc.agency ?? '',
    createdAt: sc.createdAt,
    comment: sc.comment ?? '',
    reservedUntil: sc.reservedUntil,
  }
}

function extractApiError(err: unknown): string | null {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err instanceof Error ? err.message : null)
  )
}

const inputCls = 'h-9 w-full rounded-[4px] border border-[rgba(242,207,141,0.22)] bg-[rgba(0,0,0,0.28)] px-3 text-[15px] text-[#fcecc8] outline-none transition-colors focus:border-[rgba(242,207,141,0.5)] placeholder:text-[rgba(242,207,141,0.3)]'

interface FormState {
  clientName: string
  clientPhone: string
  realtorName: string
  agency: string
  comment: string
}

const emptyForm = (): FormState => ({
  clientName: '', clientPhone: '', realtorName: '', agency: '', comment: '',
})

export function ClientRegistrationsPanel({ project, readOnly }: { project: IProject; readOnly: boolean }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<ClientRegistrationRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRows([])
    setShowForm(false)
    setForm(emptyForm())
    setError(null)
    developmentApi.getSalesClients({ complexId: project._id })
      .then((resp) => {
        if (!cancelled && resp.success) setRows(resp.data.items.map(toRow))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(extractApiError(err) ?? t('salesManagement.registrations.errors.loadFailed', 'Не удалось загрузить регистрации'))
        }
      })
    return () => { cancelled = true }
  }, [project._id, t])

  async function handleSubmit() {
    if (isSubmitting) return
    if (!form.clientName.trim()) { setError(t('salesManagement.registrations.errors.nameRequired', 'Укажите имя клиента')); return }
    if (!form.clientPhone.trim()) { setError(t('salesManagement.registrations.errors.phoneRequired', 'Укажите телефон')); return }
    if (!form.realtorName.trim()) { setError(t('salesManagement.registrations.errors.realtorRequired', 'Укажите риэлтора')); return }

    setIsSubmitting(true)
    try {
      const resp = await developmentApi.createSalesClient({
        complexId: project._id,
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        realtorName: form.realtorName.trim(),
        agency: form.agency.trim() || undefined,
        comment: form.comment.trim() || undefined,
      })
      if (!resp.success) {
        setError(resp.message ?? t('salesManagement.registrations.errors.saveFailed', 'Не удалось сохранить регистрацию'))
        return
      }
      setRows((prev) => [toRow(resp.data), ...prev])
      setForm(emptyForm())
      setShowForm(false)
      setError(null)
    } catch (err) {
      setError(extractApiError(err) ?? t('salesManagement.registrations.errors.saveFailed', 'Не удалось сохранить регистрацию'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Форма добавления */}
      {showForm ? (
        <div className="rounded-[8px] border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.25)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[16px] text-[rgba(242,207,141,0.7)]">{t('salesManagement.registrations.newTitle', 'Новая регистрация')}</span>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }}
              className="text-[rgba(242,207,141,0.4)] hover:text-[#fcecc8] transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-[16px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('salesManagement.registrations.fields.clientName', 'Имя клиента *')}</span>
              <input type="text" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                placeholder={t('salesManagement.registrations.fields.clientNamePlaceholder', 'Иван Петров')} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[16px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('salesManagement.registrations.fields.phone', 'Телефон *')}</span>
              <input type="tel" value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                placeholder={t('salesManagement.registrations.fields.phonePlaceholder', '+995...')} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[16px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('salesManagement.registrations.fields.realtor', 'Риэлтор *')}</span>
              <input type="text" value={form.realtorName} onChange={(e) => setForm((f) => ({ ...f, realtorName: e.target.value }))}
                placeholder={t('salesManagement.registrations.fields.realtorPlaceholder', 'ФИО риэлтора')} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[16px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('salesManagement.registrations.fields.agency', 'Агентство')}</span>
              <input type="text" value={form.agency} onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))}
                placeholder={t('salesManagement.registrations.fields.agencyPlaceholder', 'Название агентства')} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[16px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('salesManagement.registrations.fields.comment', 'Комментарий')}</span>
              <input type="text" value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                placeholder={t('salesManagement.registrations.fields.commentPlaceholder', 'Пожелания, интересы клиента')} className={inputCls} />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-[16px] text-[#ffb4ab]">{error}</p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={handleSubmit} disabled={isSubmitting}
              className="rounded-[4px] bg-[#c9a84c] px-4 py-2 text-[16px] font-medium text-[#0a1f12] transition-colors hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting
                ? t('salesManagement.registrations.submitting', 'Сохранение…')
                : t('salesManagement.registrations.submit', 'Зафиксировать')}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }}
              className="px-3 py-2 text-[16px] text-[rgba(242,207,141,0.6)] hover:text-[#fcecc8] transition-colors">
              {t('common.cancel', 'Отмена')}
            </button>
          </div>
        </div>
      ) : (
        !readOnly && (
          <div>
            <button type="button" onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[rgba(242,207,141,0.22)] bg-[rgba(0,0,0,0.25)] px-4 py-2 text-[16px] text-[rgba(242,207,141,0.85)] transition-colors hover:border-[rgba(242,207,141,0.4)] hover:text-[#fcecc8]">
              <Plus size={14} />
              {t('salesManagement.registrations.addButton', 'Зафиксировать клиента')}
            </button>
          </div>
        )
      )}

      {/* Таблица */}
      <div className="rounded-[8px] border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)]">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="text-[16px] font-normal uppercase tracking-wide text-[rgba(242,207,141,0.45)] bg-[rgba(255,255,255,0.02)]">
              <th className="px-4 py-3 font-normal">{t('salesManagement.registrations.columns.client', 'Клиент')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.registrations.columns.phone', 'Телефон')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.registrations.columns.realtor', 'Риэлтор')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.registrations.columns.date', 'Дата')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.registrations.columns.reservedUntil', 'Резерв до')}</th>
              <th className="px-4 py-3 font-normal">{t('salesManagement.registrations.columns.comment', 'Комментарий')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}
                className="border-b border-[rgba(242,207,141,0.07)] last:border-0 hover:bg-[rgba(255,255,255,0.015)] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <User size={13} className="text-[rgba(242,207,141,0.4)] shrink-0" />
                    <span className="text-[15px] text-[#fcecc8]">{row.clientName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[15px] text-[rgba(242,207,141,0.72)] whitespace-nowrap">
                  {maskPhone(row.clientPhone)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-[15px] text-[#fcecc8]">{row.realtorName}</div>
                  {row.agency && (
                    <div className="text-[13px] text-[rgba(242,207,141,0.5)] mt-0.5">{row.agency}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-[15px] text-[rgba(242,207,141,0.72)] whitespace-nowrap">
                  {formatDate(row.createdAt)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-[16px] text-[#fcecc8]">{formatDate(row.reservedUntil)}</div>
                  <div className={reservationStatus(row) === 'expired' ? 'text-[16px] text-[#ffb4ab] mt-0.5' : 'text-[16px] text-[#d0e8df] mt-0.5'}>
                    {reservationStatus(row) === 'expired'
                      ? t('salesManagement.registrations.reservationStatus.expired', 'Истёк')
                      : t('salesManagement.registrations.reservationStatus.active', 'Активен')}
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[220px]">
                  <span className="line-clamp-2 text-[13px] text-[rgba(242,207,141,0.55)]">
                    {row.comment || '—'}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[16px] text-[rgba(242,207,141,0.4)]">
                  {t('salesManagement.registrations.empty', 'Регистраций пока нет')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
