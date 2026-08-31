import { FormEvent, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { PermissionScope } from '../types/admin'

const SCOPES: PermissionScope[] = ['global', 'city', 'own', 'position', 'team', 'organization', 'project', 'assigned', 'domain']
// city/domain/project требуют scopeValue на сервере (PolicyEvaluatorService.scopeCovers) —
// UI не даёт отправить их без значения, но окончательная валидация всё равно на сервере.
const SCOPES_REQUIRING_VALUE: PermissionScope[] = ['city', 'domain', 'project']

interface Props {
  adminAccountId: string
  onGranted: () => void
}

/**
 * "запретить UI отправлять недопустимые комбинации, но сервер остаётся
 * источником истины" — форма не даёт отправить city/domain/project без
 * scopeValue (client-side guard), но не пытается предугадать все
 * серверные правила (self-escalation, subject existence и т.д.) — те
 * ошибки просто показываются как есть из AdminApiError.message.
 */
export function GrantForm({ adminAccountId, onGranted }: Props) {
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')
  const [scope, setScope] = useState<PermissionScope>('city')
  const [scopeValue, setScopeValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiresValue = SCOPES_REQUIRING_VALUE.includes(scope)
  const canSubmit = resource.trim().length > 0 && action.trim().length > 0 && (!requiresValue || scopeValue.trim().length > 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await adminApi.grantPermission(adminAccountId, {
        resource: resource.trim(),
        action: action.trim(),
        scope,
        scopeValue: requiresValue ? scopeValue.trim() : undefined,
      })
      onGranted()
      setResource('')
      setAction('')
      setScopeValue('')
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : 'Не удалось выдать право доступа.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="grant-form" onSubmit={handleSubmit}>
      <div className="grant-form__row">
        <div className="filter-field">
          <label htmlFor="grant-resource">Ресурс</label>
          <input id="grant-resource" value={resource} onChange={(e) => setResource(e.target.value)} placeholder="development" required />
        </div>
        <div className="filter-field">
          <label htmlFor="grant-action">Действие</label>
          <input id="grant-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="read" required />
        </div>
        <div className="filter-field">
          <label htmlFor="grant-scope">Scope</label>
          <select id="grant-scope" value={scope} onChange={(e) => setScope(e.target.value as PermissionScope)}>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {requiresValue ? (
          <div className="filter-field">
            <label htmlFor="grant-scope-value">Значение scope</label>
            <input id="grant-scope-value" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder="batumi" required />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={!canSubmit || submitting}>
        {submitting ? 'Выдаём…' : 'Выдать право'}
      </button>
    </form>
  )
}
