import { FormEvent, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../api/admin-api'
import { useAdminComplaints } from '../hooks/useAdminComplaints'
import { useConfirmReasonAction } from '../hooks/useConfirmReasonAction'
import { ConfirmReasonDialog } from '../components/ConfirmReasonDialog'
import { complaintCategoryLabel, complaintStatusLabel, formatDateTime } from '../lib/format'
import type { AdminComplaintListItem, ComplaintStatus, ResolveComplaintResult } from '../types/admin'

const COMPLAINT_STATUSES: ComplaintStatus[] = ['pending', 'resolved_upheld', 'resolved_dismissed']

function canResolve(item: AdminComplaintListItem): boolean {
  return item.status === 'pending'
}

function readStatusFromUrl(value: string | null): ComplaintStatus | '' {
  return value && (COMPLAINT_STATUSES as string[]).includes(value) ? (value as ComplaintStatus) : ''
}

export function ComplaintsPage() {
  const [searchParams] = useSearchParams()
  const [statusInput, setStatusInput] = useState<ComplaintStatus | ''>(() =>
    readStatusFromUrl(searchParams.get('status')),
  )
  const [activeFilter, setActiveFilter] = useState<{ status?: ComplaintStatus }>(() => {
    const status = readStatusFromUrl(searchParams.get('status'))
    return status ? { status } : {}
  })

  const { state, loadMore, applyResolved } = useAdminComplaints(activeFilter)

  const upheldAction = useConfirmReasonAction<AdminComplaintListItem, ResolveComplaintResult>(
    (complaint, reason) => adminApi.resolveComplaint(complaint.id, { decision: 'upheld', reason }),
    (result, target) => {
      applyResolved({ id: result.id, status: result.status, resolutionReason: target.resolutionReason })
    },
  )

  const dismissedAction = useConfirmReasonAction<AdminComplaintListItem, ResolveComplaintResult>(
    (complaint, reason) => adminApi.resolveComplaint(complaint.id, { decision: 'dismissed', reason }),
    (result, target) => {
      applyResolved({ id: result.id, status: result.status, resolutionReason: target.resolutionReason })
    },
  )

  function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveFilter({ status: statusInput || undefined })
  }

  function resetFilter() {
    setStatusInput('')
    setActiveFilter({})
  }

  return (
    <section className="page">
      <div className="page-header">
        <h1>Жалобы на публикации</h1>
        <p className="page-caption">
          Список ограничен вашим scope — вы видите жалобы только по тем городам, на которые у вас есть grant (complaint.resolve.city).
        </p>
      </div>

      <form className="filter-bar" onSubmit={submitFilter}>
        <div className="filter-field">
          <label htmlFor="filter-complaint-status">Статус</label>
          <select
            id="filter-complaint-status"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as ComplaintStatus | '')}
          >
            <option value="">По умолчанию (ожидают проверки)</option>
            {COMPLAINT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {complaintStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Применить</button>
        {activeFilter.status ? (
          <button type="button" className="secondary" onClick={resetFilter}>
            Сбросить
          </button>
        ) : null}
      </form>

      {state.status === 'loading' ? <div className="state-panel">Загружаем жалобы…</div> : null}
      {state.status === 'error' ? (
        <div className="state-panel state-panel--error">
          <p>{state.message}</p>
          <button type="button" onClick={state.retry}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? (
        <div className="state-panel">Жалоб по этому фильтру нет — либо их нет в системе, либо они вне вашего scope.</div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Город</th>
                  <th>Детали</th>
                  <th>ID объявления</th>
                  <th>Статус</th>
                  <th>Подана</th>
                  <th>Решена</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{complaintCategoryLabel(item.category)}</td>
                    <td>{item.scopeCity || '—'}</td>
                    <td>{item.details ?? '—'}</td>
                    <td>
                      <code>{item.listingId}</code>
                    </td>
                    <td>
                      <span className={`status-pill status-pill--${item.status}`}>{complaintStatusLabel(item.status)}</span>
                      {item.resolutionReason ? <p className="unpublish-reason">Причина: {item.resolutionReason}</p> : null}
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{formatDateTime(item.resolvedAt)}</td>
                    <td>
                      {canResolve(item) ? (
                        <div className="row-actions">
                          <button type="button" className="danger" onClick={() => upheldAction.open(item)}>
                            Удовлетворить
                          </button>
                          <button type="button" className="secondary" onClick={() => dismissedAction.open(item)}>
                            Отклонить
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.nextCursor ? (
            <button className="load-more" type="button" onClick={loadMore} disabled={state.loadingMore}>
              {state.loadingMore ? 'Загружаем…' : 'Показать ещё'}
            </button>
          ) : null}
        </>
      ) : null}

      <ConfirmReasonDialog
        dialog={upheldAction.dialog}
        title="Удовлетворить жалобу?"
        renderTarget={(complaint) =>
          `${complaintCategoryLabel(complaint.category)} — ${complaint.scopeCity} (объявление ${complaint.listingId})`
        }
        warning="Публикация объявления будет автоматически снята с витрины, а жалоба переведена в статус «Удовлетворена». Действие необратимо и фиксируется в аудите."
        confirmLabel="Удовлетворить"
        confirmingLabel="Сохраняем…"
        minReasonLength={upheldAction.minReasonLength}
        canSubmit={upheldAction.canSubmit}
        onReasonChange={upheldAction.setReason}
        onCancel={upheldAction.close}
        onConfirm={() => void upheldAction.submit()}
      />

      <ConfirmReasonDialog
        dialog={dismissedAction.dialog}
        title="Отклонить жалобу?"
        renderTarget={(complaint) =>
          `${complaintCategoryLabel(complaint.category)} — ${complaint.scopeCity} (объявление ${complaint.listingId})`
        }
        warning="Жалоба будет отклонена, объявление останется опубликованным на витрине. Действие необратимо и фиксируется в аудите."
        confirmLabel="Отклонить"
        confirmingLabel="Отклоняем…"
        minReasonLength={dismissedAction.minReasonLength}
        canSubmit={dismissedAction.canSubmit}
        onReasonChange={dismissedAction.setReason}
        onCancel={dismissedAction.close}
        onConfirm={() => void dismissedAction.submit()}
      />
    </section>
  )
}
