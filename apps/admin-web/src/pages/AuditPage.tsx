import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth } from '../hooks/useAdminAuth'
import { useAdminAuditEvents } from '../hooks/useAdminAuditEvents'
import { AuditEventDetailDrawer } from '../components/AuditEventDetailDrawer'
import { formatDateTime, sourceTypeLabel } from '../lib/format'
import type { AdminAuditEventView, AuditResource } from '../types/admin'

const PUBLICATION_RESOURCES: AuditResource[] = ['development', 'unit', 'listing']

function resourceLabel(resource: string): string {
  if (resource === 'admin_account') return 'Admin-аккаунт'
  return sourceTypeLabel(resource)
}

/**
 * Ссылка на цель события — только если текущая роль может её увидеть
 * (та же scope-проверка, что уже применена сервером к самому списку
 * событий: если событие вообще пришло в ответе, значит доступ уже
 * подтверждён). Deep-link на КОНКРЕТНУЮ запись публикации/аккаунта не
 * поддержан существующими страницами (PublicationsPage/AccountsPage не
 * принимают id из query) — ссылка ведёт на уже отфильтрованный список,
 * не на несуществующий route.
 */
function TargetLink({ event, isSuperAdmin }: { event: AdminAuditEventView; isSuperAdmin: boolean }) {
  if (PUBLICATION_RESOURCES.includes(event.resource as AuditResource)) {
    return <Link to={`/publications?sourceType=${encodeURIComponent(event.resource)}`}>{event.resourceId}</Link>
  }
  if (event.resource === 'admin_account' && isSuperAdmin) {
    return <Link to="/accounts">{event.resourceId}</Link>
  }
  return <span>{event.resourceId}</span>
}

export function AuditPage() {
  const { state: authState } = useAdminAuth()
  const isSuperAdmin = authState.status === 'signed-in' && authState.me.isSuperAdmin
  const availableResources: AuditResource[] = isSuperAdmin ? [...PUBLICATION_RESOURCES, 'admin_account'] : PUBLICATION_RESOURCES

  const [resourceInput, setResourceInput] = useState<AuditResource | ''>('')
  const [actionInput, setActionInput] = useState('')
  const [resourceIdInput, setResourceIdInput] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [activeFilter, setActiveFilter] = useState<{
    resource?: AuditResource
    action?: string
    resourceId?: string
    from?: string
    to?: string
  }>({})
  const [selectedEvent, setSelectedEvent] = useState<AdminAuditEventView | null>(null)

  const { state, loadMore } = useAdminAuditEvents(activeFilter)

  function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveFilter({
      resource: resourceInput || undefined,
      action: actionInput.trim() || undefined,
      resourceId: resourceIdInput.trim() || undefined,
      from: fromInput || undefined,
      to: toInput || undefined,
    })
  }

  function resetFilter() {
    setResourceInput('')
    setActionInput('')
    setResourceIdInput('')
    setFromInput('')
    setToInput('')
    setActiveFilter({})
  }

  const hasActiveFilter = Object.values(activeFilter).some((value) => value !== undefined)

  return (
    <section className="page">
      <div className="page-header">
        <h1>Журнал аудита</h1>
        <p className="page-caption">
          {isSuperAdmin
            ? 'Все критические действия в системе: публикации, admin-аккаунты, выдача и отзыв прав.'
            : 'Список ограничен вашим scope — вы видите только события публикаций в разрешённых типах/городах.'}
        </p>
      </div>

      <form className="filter-bar" onSubmit={submitFilter} aria-label="Фильтры журнала аудита">
        <div className="filter-field">
          <label htmlFor="audit-filter-resource">Тип ресурса</label>
          <select
            id="audit-filter-resource"
            value={resourceInput}
            onChange={(e) => setResourceInput(e.target.value as AuditResource | '')}
          >
            <option value="">Все доступные</option>
            {availableResources.map((resource) => (
              <option key={resource} value={resource}>
                {resourceLabel(resource)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="audit-filter-action">Действие</label>
          <input
            id="audit-filter-action"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            placeholder="Например, publication.unpublish"
          />
        </div>
        <div className="filter-field">
          <label htmlFor="audit-filter-resource-id">ID цели</label>
          <input
            id="audit-filter-resource-id"
            value={resourceIdInput}
            onChange={(e) => setResourceIdInput(e.target.value)}
            placeholder="resourceId"
          />
        </div>
        <div className="filter-field">
          <label htmlFor="audit-filter-from">С даты</label>
          <input id="audit-filter-from" type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
        </div>
        <div className="filter-field">
          <label htmlFor="audit-filter-to">По дату</label>
          <input id="audit-filter-to" type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} />
        </div>
        <button type="submit">Применить</button>
        {hasActiveFilter ? (
          <button type="button" className="secondary" onClick={resetFilter}>
            Сбросить
          </button>
        ) : null}
      </form>

      {state.status === 'loading' ? (
        <div className="state-panel" role="status">
          Загружаем журнал аудита…
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="state-panel state-panel--error" role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={state.retry}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? (
        <div className="state-panel">По этому фильтру событий нет — либо их не было, либо они вне вашего scope.</div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Действие</th>
                  <th>Ресурс</th>
                  <th>Цель</th>
                  <th>Инициатор</th>
                  <th aria-label="Подробнее" />
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.action}</td>
                    <td>{resourceLabel(item.resource)}</td>
                    <td>
                      <TargetLink event={item} isSuperAdmin={isSuperAdmin} />
                    </td>
                    <td>
                      {item.actor.type}
                      {item.actor.id ? ` · ${item.actor.id}` : ''}
                    </td>
                    <td>
                      <button type="button" className="secondary" onClick={() => setSelectedEvent(item)}>
                        Подробнее
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.nextCursor ? (
            <button className="load-more" type="button" onClick={loadMore} disabled={state.loadingMore}>
              {state.loadingMore ? 'Загружаем…' : 'Загрузить ещё'}
            </button>
          ) : null}
        </>
      ) : null}

      <AuditEventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </section>
  )
}
