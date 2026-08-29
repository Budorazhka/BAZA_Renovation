import { useCallback, useEffect, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import { useAdminAccounts } from '../hooks/useAdminAccounts'
import { useConfirmReasonAction } from '../hooks/useConfirmReasonAction'
import { useAdminAuth } from '../hooks/useAdminAuth'
import { CreateAdminAccountForm } from '../components/CreateAdminAccountForm'
import { GrantForm } from '../components/GrantForm'
import { ConfirmReasonDialog } from '../components/ConfirmReasonDialog'
import { formatDateTime } from '../lib/format'
import type { AdminAccountListItem, PermissionGrant } from '../types/admin'

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

  const revokeAction = useConfirmReasonAction<PermissionGrant, { revoked: true }>(
    (grant, reason) => adminApi.revokeGrant(adminAccountId, grant.id, { reason, expectedVersion: grant.version }),
    () => void load(),
  )

  return (
    <div className="grants-panel">
      <h3>Права доступа</h3>
      {error ? <p className="auth-error">{error}</p> : null}
      {grants === null && !error ? <p>Загружаем…</p> : null}
      {grants && grants.length === 0 ? <p>Прав пока не выдано.</p> : null}
      {grants && grants.length > 0 ? (
        <ul className="grants-list">
          {grants.map((grant) => (
            <li key={grant.id}>
              <code>
                {grant.resource}.{grant.action}
              </code>{' '}
              — {grant.scope}
              {grant.scopeValue ? ` (${grant.scopeValue})` : ''}
              {grant.revokedAt ? (
                <span className="grant-revoked"> — отозван {formatDateTime(grant.revokedAt)}{grant.revokeReason ? `: ${grant.revokeReason}` : ''}</span>
              ) : (
                <button type="button" className="link-button" onClick={() => revokeAction.open(grant)}>
                  Отозвать
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <GrantForm adminAccountId={adminAccountId} onGranted={() => void load()} />

      <ConfirmReasonDialog
        dialog={revokeAction.dialog}
        title="Отозвать право доступа?"
        renderTarget={(grant) => `${grant.resource}.${grant.action} — ${grant.scope}${grant.scopeValue ? ` (${grant.scopeValue})` : ''}`}
        warning="Право доступа будет немедленно отозвано и зафиксировано в журнале аудита. Отменить отзыв нельзя — потребуется выдать право заново."
        confirmLabel="Отозвать"
        confirmingLabel="Отзываем…"
        minReasonLength={revokeAction.minReasonLength}
        canSubmit={revokeAction.canSubmit}
        onReasonChange={revokeAction.setReason}
        onCancel={revokeAction.close}
        onConfirm={() => void revokeAction.submit()}
      />
    </div>
  )
}

/**
 * super_admin-only экран (RequireSuperAdmin в App.tsx) — управление
 * admin-аккаунтами и их grants: создание, деактивация/реактивация,
 * просмотр и отзыв grants. Нет optimistic state нигде на этой странице —
 * каждое опасное действие обновляет таблицу только реальным ответом
 * сервера (reload() — полный повторный запрос первой страницы, не
 * локальный патч объекта, чтобы список не разошёлся с сервером при
 * конкурентных изменениях от другого super_admin).
 */
export function AccountsPage() {
  const { state, reload, loadMore } = useAdminAccounts()
  const { state: authState } = useAdminAuth()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [justCreatedIds, setJustCreatedIds] = useState<string[]>([])
  const ownAdminAccountId = authState.status === 'signed-in' ? authState.me.adminAccountId : null

  const deactivateAction = useConfirmReasonAction<AdminAccountListItem, { status: 'active' | 'deactivated' }>(
    (account, reason) => adminApi.deactivateAccount(account.id, reason),
    () => reload(),
  )
  const reactivateAction = useConfirmReasonAction<AdminAccountListItem, { status: 'active' | 'deactivated' }>(
    (account, reason) => adminApi.reactivateAccount(account.id, reason),
    () => reload(),
  )

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
                    <td className="row-actions">
                      <button type="button" className="secondary" onClick={() => setSelectedAccountId(account.id)}>
                        Права доступа
                      </button>
                      {account.status === 'active' ? (
                        <button
                          type="button"
                          className="danger"
                          disabled={account.id === ownAdminAccountId}
                          title={account.id === ownAdminAccountId ? 'Нельзя деактивировать собственный аккаунт' : undefined}
                          onClick={() => deactivateAction.open(account)}
                        >
                          Деактивировать
                        </button>
                      ) : (
                        <button type="button" className="secondary" onClick={() => reactivateAction.open(account)}>
                          Восстановить
                        </button>
                      )}
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

      <ConfirmReasonDialog
        dialog={deactivateAction.dialog}
        title="Деактивировать admin-аккаунт?"
        renderTarget={(account) => `Identity: ${account.identityId} · ${account.isSuperAdmin ? 'super_admin' : 'admin'}`}
        warning="Все активные admin-сессии этого аккаунта будут немедленно отозваны. Действие зафиксируется в журнале аудита."
        confirmLabel="Деактивировать"
        confirmingLabel="Деактивируем…"
        minReasonLength={deactivateAction.minReasonLength}
        canSubmit={deactivateAction.canSubmit}
        onReasonChange={deactivateAction.setReason}
        onCancel={deactivateAction.close}
        onConfirm={() => void deactivateAction.submit()}
      />

      <ConfirmReasonDialog
        dialog={reactivateAction.dialog}
        title="Восстановить доступ admin-аккаунту?"
        renderTarget={(account) => `Identity: ${account.identityId} · ${account.isSuperAdmin ? 'super_admin' : 'admin'}`}
        warning="Аккаунт снова сможет войти в систему. Старая сессия не восстанавливается — потребуется новый вход."
        confirmLabel="Восстановить"
        confirmingLabel="Восстанавливаем…"
        minReasonLength={reactivateAction.minReasonLength}
        canSubmit={reactivateAction.canSubmit}
        onReasonChange={reactivateAction.setReason}
        onCancel={reactivateAction.close}
        onConfirm={() => void reactivateAction.submit()}
      />
    </section>
  )
}
