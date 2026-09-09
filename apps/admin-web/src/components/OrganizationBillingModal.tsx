import { FormEvent, useEffect, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import { formatDateTime, organizationTypeLabel } from '../lib/format'
import type {
  AdminBillingOverview,
  AdminOrganizationListItem,
} from '../types/admin'

const AVAILABLE_PLANS = [
  { code: 'developer_trial', name: 'Developer Trial (Застройщик Пробный)', defaultDays: 14, price: 0 },
  { code: 'developer_standard', name: 'Developer Standard (Застройщик Стандарт)', defaultDays: 30, price: 99 },
  { code: 'developer_pro', name: 'Developer Pro (Застройщик Профи)', defaultDays: 30, price: 299 },
  { code: 'agency_trial', name: 'Agency Trial (Агентство Пробный)', defaultDays: 14, price: 0 },
  { code: 'agency_pro', name: 'Agency Pro (Агентство Профи)', defaultDays: 30, price: 149 },
  { code: 'realtor_free', name: 'Realtor Free (Риелтор Бесплатный)', defaultDays: 365, price: 0 },
  { code: 'realtor_pro', name: 'Realtor Pro (Риелтор Профи)', defaultDays: 30, price: 49 },
]

interface OrganizationBillingModalProps {
  organization: AdminOrganizationListItem | null
  onClose: () => void
}

export function OrganizationBillingModal({ organization, onClose }: OrganizationBillingModalProps) {
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [planCode, setPlanCode] = useState('agency_pro')
  const [periodDays, setPeriodDays] = useState(30)
  const [amount, setAmount] = useState(149)
  const [currency, setCurrency] = useState('USD')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  const loadBilling = async () => {
    if (!organization) return
    try {
      setLoading(true)
      setError(null)
      const data = await adminApi.getOrganizationBilling(organization.id)
      setOverview(data)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
      } else {
        setError('Не удалось загрузить биллинг организации')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (organization) {
      loadBilling()
      setSubmitError(null)
      setSubmitSuccess(null)
      setReason('')
    }
  }, [organization?.id])

  if (!organization) return null

  const handlePlanChange = (newPlanCode: string) => {
    setPlanCode(newPlanCode)
    const found = AVAILABLE_PLANS.find((p) => p.code === newPlanCode)
    if (found) {
      setPeriodDays(found.defaultDays)
      setAmount(found.price)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (reason.trim().length < 10) {
      setSubmitError('Обоснование должно содержать не менее 10 символов')
      return
    }

    try {
      setSubmitting(true)
      setSubmitError(null)
      setSubmitSuccess(null)

      await adminApi.activateSubscription(organization.id, {
        planCode,
        periodDays: Number(periodDays),
        amountMinorUnits: Math.round(Number(amount) * 100),
        currency,
        reason: reason.trim(),
      })

      setSubmitSuccess('Тариф успешно активирован/продлён')
      setReason('')
      await loadBilling()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Ошибка при активации тарифа')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sub = overview?.subscription
  const effectiveLimits = overview?.effectiveLimits
  const ledger = overview?.ledger || []

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-content dialog-content--large"
        style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>Биллинг и тариф: {organization.name}</h2>
          <span className="muted-text">({organizationTypeLabel(organization.type)})</span>
        </div>

        {loading ? (
          <div className="state-panel">Загрузка информации о биллинге…</div>
        ) : error ? (
          <div className="state-panel state-panel--error">
            <p>{error}</p>
            <button type="button" onClick={loadBilling}>
              Повторить
            </button>
          </div>
        ) : (
          <div className="billing-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Current status summary */}
            {sub && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '16px',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '15px' }}>Текущая подписка</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <span className="muted-text" style={{ fontSize: '12px' }}>Тариф:</span>
                    <div><strong>{overview.plan?.name || sub.planCode}</strong></div>
                  </div>
                  <div>
                    <span className="muted-text" style={{ fontSize: '12px' }}>Статус:</span>
                    <div>
                      <span className={`status-badge status-badge--${sub.status}`}>
                        {sub.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="muted-text" style={{ fontSize: '12px' }}>Истекает:</span>
                    <div><strong>{formatDateTime(sub.expiresAt)}</strong></div>
                  </div>
                </div>

                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span className="muted-text" style={{ fontSize: '12px' }}>Использование ресурсов:</span>
                  <div style={{ display: 'flex', gap: '24px', marginTop: '6px', fontSize: '13px' }}>
                    <div>
                      Объекты: <strong>{sub.currentUsage?.activeListings ?? 0}</strong> / {effectiveLimits?.maxActiveListings ?? '—'}
                    </div>
                    <div>
                      Сотрудники: <strong>{sub.currentUsage?.teamPositions ?? 1}</strong> / {effectiveLimits?.maxTeamPositions ?? '—'}
                    </div>
                    <div>
                      CRM: <strong>{effectiveLimits?.crmAccess ? 'Да' : 'Нет'}</strong>
                    </div>
                    <div>
                      Шахматка: <strong>{effectiveLimits?.chessboardAccess ? 'Да' : 'Нет'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Activate / Renew Form */}
            <form
              onSubmit={handleSubmit}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <h3 style={{ margin: '0 0 14px', fontSize: '15px' }}>Активировать / Продлить тариф</h3>

              {submitSuccess && (
                <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: '6px', color: '#4ade80', fontSize: '13px' }}>
                  {submitSuccess}
                </div>
              )}
              {submitError && (
                <div style={{ padding: '8px 12px', marginBottom: '12px', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '6px', color: '#f87171', fontSize: '13px' }}>
                  {submitError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div className="filter-field">
                  <label htmlFor="select-billing-plan">Тарифный план</label>
                  <select
                    id="select-billing-plan"
                    value={planCode}
                    onChange={(e) => handlePlanChange(e.target.value)}
                  >
                    {AVAILABLE_PLANS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-field">
                  <label htmlFor="input-billing-period">Период (дней)</label>
                  <input
                    id="input-billing-period"
                    type="number"
                    min="1"
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </div>

                <div className="filter-field">
                  <label htmlFor="input-billing-amount">Сумма оплаты</label>
                  <input
                    id="input-billing-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  />
                </div>

                <div className="filter-field">
                  <label htmlFor="select-billing-currency">Валюта</label>
                  <select
                    id="select-billing-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="GEL">GEL (₾)</option>
                    <option value="RUB">RUB (₽)</option>
                  </select>
                </div>
              </div>

              <div className="filter-field" style={{ marginBottom: '14px' }}>
                <label htmlFor="input-billing-reason">
                  Обоснование ручной операции (обязательно, мин. 10 символов)
                </label>
                <textarea
                  id="input-billing-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Например: Оплата по выставленному счёту №1042 от 09.09.2026"
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <span className="muted-text" style={{ fontSize: '11px' }}>
                  {reason.trim().length} / 10 символов (минимум)
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || reason.trim().length < 10}
              >
                {submitting ? 'Сохраняем…' : 'Активировать / Продлить'}
              </button>
            </form>

            {/* Ledger history */}
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>История операций леджера</h3>
              {ledger.length === 0 ? (
                <div className="muted-text" style={{ fontSize: '13px' }}>Записей в леджере пока нет.</div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table" style={{ fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Действие</th>
                        <th>Тариф</th>
                        <th>Сумма</th>
                        <th>Дней</th>
                        <th>Обоснование</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((entry) => (
                        <tr key={entry.id || `${entry.createdAt}-${entry.planCode}`}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</td>
                          <td>
                            <span className="status-badge">
                              {entry.action === 'plan_activated' ? 'Активация' : entry.action === 'plan_renewed' ? 'Продление' : entry.action}
                            </span>
                          </td>
                          <td>{entry.planCode}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {(entry.amountMinorUnits / 100).toLocaleString('ru-RU')} {entry.currency}
                          </td>
                          <td>{entry.periodDays}</td>
                          <td style={{ maxWidth: '240px', wordBreak: 'break-word' }}>{entry.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
