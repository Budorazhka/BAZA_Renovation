import { useEffect } from 'react'
import { formatDateTime } from '../lib/format'
import type { AdminAuditEventView } from '../types/admin'

interface Props {
  event: AdminAuditEventView | null
  onClose: () => void
}

function DiffField({ label, value }: { label: string; fieldKey: string; value: unknown }) {
  return (
    <div className="audit-diff-field">
      <span className="audit-diff-field__key">{label}</span>
      <span className="audit-diff-field__value">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
    </div>
  )
}

/**
 * before/after здесь — уже отредактированный whitelist с backend
 * (admin-audit-projection.ts), не сырой audit payload — drawer рендерит
 * ровно то, что пришло по сети, не решает сам, что можно показывать.
 */
export function AuditEventDetailDrawer({ event, onClose }: Props) {
  useEffect(() => {
    if (!event) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [event, onClose])

  if (!event) return null

  const beforeEntries = event.before ? Object.entries(event.before) : []
  const afterEntries = event.after ? Object.entries(event.after) : []

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog-card audit-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="audit-detail-title">{event.summary}</h2>
        <p className="dialog-target">
          {event.action} · {event.resource} · {event.resourceId}
        </p>
        <dl className="audit-detail-meta">
          <dt>Время</dt>
          <dd>{formatDateTime(event.createdAt)}</dd>
          <dt>Инициатор</dt>
          <dd>
            {event.actor.type}
            {event.actor.id ? ` · ${event.actor.id}` : ''}
          </dd>
          <dt>Correlation ID</dt>
          <dd>{event.correlationId}</dd>
          {event.reason ? (
            <>
              <dt>Причина</dt>
              <dd>{event.reason}</dd>
            </>
          ) : null}
        </dl>

        {beforeEntries.length > 0 || afterEntries.length > 0 ? (
          <div className="audit-diff">
            {beforeEntries.length > 0 ? (
              <div className="audit-diff-column">
                <h3>До</h3>
                {beforeEntries.map(([key, value]) => (
                  <DiffField key={key} label={key} fieldKey={key} value={value} />
                ))}
              </div>
            ) : null}
            {afterEntries.length > 0 ? (
              <div className="audit-diff-column">
                <h3>После</h3>
                {afterEntries.map(([key, value]) => (
                  <DiffField key={key} label={key} fieldKey={key} value={value} />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="dialog-target">Дополнительных полей для этого события нет.</p>
        )}

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose} autoFocus>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
