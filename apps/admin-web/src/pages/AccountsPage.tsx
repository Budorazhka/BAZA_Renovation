import { useCallback, useEffect, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import { useAdminAccounts } from '../hooks/useAdminAccounts'
import { CreateAdminAccountForm } from '../components/CreateAdminAccountForm'
import { GrantForm } from '../components/GrantForm'
import { formatDateTime } from '../lib/format'
import type { PermissionGrant } from '../types/admin'

function GrantsPanel({ adminAccountId }: { adminAccountId: string }) {
  const [grants, setGrants] = useState<PermissionGrant[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const response = await adminApi.listGrants(adminAccountId)
      setGrants(response.items)
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : 'Не удалось загрузить права доступа.')
    }
  }, [adminAccountId])

  useEffect(() => {
    setGrants(null)
    void load()
  }, [load])

  return (
    <div className="grants-panel">
      <h3>Права доступа</h3>
      {error ? <p className="auth-error">{error}</p> : null}
      {grants === null && !error ? <p>Загружаем…</p> : null}
      {grants && grants.length === 0 ? <p>Прав пока не выдано.</p> : null}
      {grants && grants.length > 0 ? (
        <ul className="grants-list">
          {grants.map((grant, index) => (
            <li key={`${grant.resource}-${grant.action}-${grant.scope}-${grant.scopeValue ?? ''}-${index}`}>
              <code>
                {grant.resource}.{grant.action}
              </code>{' '}
              — {grant.scope}
              {grant.scopeValue ? ` (${grant.scopeValue})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <GrantForm adminAccountId={adminAccountId} onGranted={() => void load()} />
    </div>
  )
}

/**
 * super_admin-only экран (RequireSuperAdmin в App.tsx) — управление
 * admin-аккаунтами и их grants. Grants добавляются, не редактируются/не
 * отзываются (нет DELETE-контракта на сервере — см.
 * docs/operations/admin-control-plane.md "Не реализовано"), UI честно не
 * притворяется, что умеет больше, чем реально может API.
 */
export function AccountsPage() {
  const { state, loadMore } = useAdminAccounts()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [justCreatedIds, setJustCreatedIds] = useState<string[]>([])

  return (
    <section className="page">
      <div className="page-header">
        <h1>Admin-аккаунты</h1>
        <p className="page-caption">Управление составом администраторов и их grants. Доступно только super_admin.</p>
      </div>

      <details className="create-account-details">
        <summary>Создать admin-аккаунт</summary>
        <CreateAdminAccountForm onCreated={(account) => setJustCreatedIds((ids) => [...ids, account.id])} />
      </details>

      {state.status === 'loading' ? <div className="state-panel">Загружаем аккаунты…</div> : null}
      {state.status === 'forbidden' ? <div className="state-panel state-panel--error">Доступ только для super_admin.</div> : null}
      {state.status === 'error' ? <div className="state-panel state-panel--error">{state.message}</div> : null}
      {state.status === 'empty' ? <div className="state-panel">Admin-аккаунтов пока нет.</div> : null}

      {state.status === 'ready' ? (
        <div className="accounts-layout">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Identity ID</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Создан</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {state.items.map((account) => (
                  <tr key={account.id} className={justCreatedIds.includes(account.id) ? 'row--highlight' : undefined}>
                    <td>
                      <code>{account.identityId}</code>
                    </td>
                    <td>{account.isSuperAdmin ? 'super_admin' : 'admin'}</td>
                    <td>{account.status === 'active' ? 'активен' : 'деактивирован'}</td>
                    <td>{formatDateTime(account.createdAt)}</td>
                    <td>
                      <button type="button" className="secondary" onClick={() => setSelectedAccountId(account.id)}>
                        Права доступа
                      </button>
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
        </div>
      ) : null}

      {selectedAccountId ? <GrantsPanel adminAccountId={selectedAccountId} /> : null}
    </section>
  )
}
