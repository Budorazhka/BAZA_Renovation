import { FormEvent, useState } from 'react'
import { adminApi } from '../api/admin-api'
import { ConfirmReasonDialog } from '../components/ConfirmReasonDialog'
import { OrganizationBillingModal } from '../components/OrganizationBillingModal'
import { useAdminOrganizations } from '../hooks/useAdminOrganizations'
import { useConfirmReasonAction } from '../hooks/useConfirmReasonAction'
import { formatDateTime, organizationStatusLabel, organizationTypeLabel } from '../lib/format'
import type {
  AdminOrganizationListItem,
  AdminOrganizationStatus,
  AdminOrganizationType,
  FreezeOrganizationResult,
  UnfreezeOrganizationResult,
} from '../types/admin'

const ORGANIZATION_TYPES: AdminOrganizationType[] = ['agency', 'developer', 'independent_realtor']
const ORGANIZATION_STATUSES: AdminOrganizationStatus[] = ['active', 'frozen', 'archived']

export function OrganizationsPage() {
  const [typeInput, setTypeInput] = useState<AdminOrganizationType | ''>('')
  const [statusInput, setStatusInput] = useState<AdminOrganizationStatus | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedBillingOrg, setSelectedBillingOrg] = useState<AdminOrganizationListItem | null>(null)

  const [activeFilter, setActiveFilter] = useState<{
    type?: AdminOrganizationType
    status?: AdminOrganizationStatus
    search?: string
  }>({})

  const { state, loadMore, applyStatusChange } = useAdminOrganizations(activeFilter)

  const freezeAction = useConfirmReasonAction<AdminOrganizationListItem, FreezeOrganizationResult>(
    (org, reason) => adminApi.freezeOrganization(org.id, reason),
    (result) => {
      applyStatusChange({ id: result.id, status: result.status })
    },
  )

  const unfreezeAction = useConfirmReasonAction<AdminOrganizationListItem, UnfreezeOrganizationResult>(
    (org, reason) => adminApi.unfreezeOrganization(org.id, reason),
    (result) => {
      applyStatusChange({ id: result.id, status: result.status })
    },
  )

  function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveFilter({
      type: typeInput || undefined,
      status: statusInput || undefined,
      search: searchInput.trim() || undefined,
    })
  }

  function resetFilter() {
    setTypeInput('')
    setStatusInput('')
    setSearchInput('')
    setActiveFilter({})
  }

  const hasActiveFilters = Boolean(activeFilter.type || activeFilter.status || activeFilter.search)

  return (
    <section className="page">
      <div className="page-header">
        <h1>Организации</h1>
        <p className="page-caption">Управление агентствами, застройщиками и риелторами платформы.</p>
      </div>

      <form className="filter-bar" onSubmit={submitFilter}>
        <div className="filter-field">
          <label htmlFor="filter-org-type">Тип</label>
          <select
            id="filter-org-type"
            value={typeInput}
            onChange={(e) => setTypeInput(e.target.value as AdminOrganizationType | '')}
          >
            <option value="">Все типы</option>
            {ORGANIZATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {organizationTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="filter-org-status">Статус</label>
          <select
            id="filter-org-status"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as AdminOrganizationStatus | '')}
          >
            <option value="">Все статусы</option>
            {ORGANIZATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {organizationStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="filter-org-search">Поиск</label>
          <input
            id="filter-org-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Название организации"
          />
        </div>

        <button type="submit">Применить</button>
        {hasActiveFilters ? (
          <button type="button" className="secondary" onClick={resetFilter}>
            Сбросить
          </button>
        ) : null}
      </form>

      {state.status === 'loading' ? <div className="state-panel">Загружаем организации…</div> : null}
      {state.status === 'error' ? (
        <div className="state-panel state-panel--error">
          <p>{state.message}</p>
          <button type="button" onClick={state.retry}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? <div className="state-panel">Организаций по данному фильтру не найдено.</div> : null}

      {state.status === 'ready' ? (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Сотрудников/позиций</th>
                  <th>Создана</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <span className="org-name">{org.name}</span>
                    </td>
                    <td>{organizationTypeLabel(org.type)}</td>
                    <td>
                      <span className={`status-badge status-badge--${org.status}`}>
                        {organizationStatusLabel(org.status)}
                      </span>
                    </td>
                    <td>{org.positionsCount ?? '—'}</td>
                    <td>{formatDateTime(org.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setSelectedBillingOrg(org)}
                        >
                          Тариф / Биллинг
                        </button>
                        {org.status === 'active' ? (
                          <button
                            type="button"
                            className="secondary danger-text"
                            onClick={() => freezeAction.open(org)}
                          >
                            Заморозить
                          </button>
                        ) : null}
                        {org.status === 'frozen' ? (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => unfreezeAction.open(org)}
                          >
                            Разморозить
                          </button>
                        ) : null}
                        {org.status === 'archived' ? (
                          <span className="muted-text">Архивирована</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {state.nextCursor ? (
            <div className="load-more-bar">
              <button
                type="button"
                className="secondary"
                onClick={loadMore}
                disabled={state.loadingMore}
              >
                {state.loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <OrganizationBillingModal
        organization={selectedBillingOrg}
        onClose={() => setSelectedBillingOrg(null)}
      />

      <ConfirmReasonDialog
        dialog={freezeAction.dialog}
        title="Заморозить организацию?"
        renderTarget={(org) => `${org.name} (${organizationTypeLabel(org.type)})`}
        warning="Заморозка организации блокирует действия её сотрудников в ERP и скрывает публикации. Действие будет зафиксировано в журнале аудита."
        confirmLabel="Заморозить"
        confirmingLabel="Замораживаем…"
        minReasonLength={freezeAction.minReasonLength}
        canSubmit={freezeAction.canSubmit}
        onReasonChange={freezeAction.setReason}
        onCancel={freezeAction.close}
        onConfirm={() => void freezeAction.submit()}
      />

      <ConfirmReasonDialog
        dialog={unfreezeAction.dialog}
        title="Разморозить организацию?"
        renderTarget={(org) => `${org.name} (${organizationTypeLabel(org.type)})`}
        warning="Разморозка возвращает организации статус active. Действие будет зафиксировано в журнале аудита."
        confirmLabel="Разморозить"
        confirmingLabel="Размораживаем…"
        minReasonLength={unfreezeAction.minReasonLength}
        canSubmit={unfreezeAction.canSubmit}
        onReasonChange={unfreezeAction.setReason}
        onCancel={unfreezeAction.close}
        onConfirm={() => void unfreezeAction.submit()}
      />
    </section>
  )
}
