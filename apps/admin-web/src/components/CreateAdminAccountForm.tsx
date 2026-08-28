import { FormEvent, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminAccountListItem } from '../types/admin'

interface Props {
  onCreated: (account: AdminAccountListItem) => void
}

/**
 * identityId должен УЖЕ существовать (POST /auth/register, отдельная
 * публичная команда — см. docs/operations/admin-control-plane.md
 * "Не реализовано: приглашение по email"). Эта форма честно требует
 * готовый identityId, не притворяется, что умеет пригласить по email.
 */
export function CreateAdminAccountForm({ onCreated }: Props) {
  const [identityId, setIdentityId] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await adminApi.createAdminAccount({ identityId: identityId.trim(), isSuperAdmin })
      onCreated({ id: created.id, identityId: created.identityId, isSuperAdmin: created.isSuperAdmin, status: 'active', createdAt: new Date().toISOString() })
      setIdentityId('')
      setIsSuperAdmin(false)
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : 'Не удалось создать admin-аккаунт.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="create-account-form" onSubmit={handleSubmit}>
      <div className="filter-field">
        <label htmlFor="create-identity-id">Identity ID (уже зарегистрированный)</label>
        <input id="create-identity-id" value={identityId} onChange={(e) => setIdentityId(e.target.value)} placeholder="Mongo ObjectId" required />
      </div>
      <label className="checkbox-field">
        <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} />
        super_admin
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={submitting || identityId.trim().length === 0}>
        {submitting ? 'Создаём…' : 'Создать admin-аккаунт'}
      </button>
    </form>
  )
}
