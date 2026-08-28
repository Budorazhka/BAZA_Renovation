import type { UnpublishDialogState } from '../hooks/useUnpublishAction'
import { sourceTypeLabel } from '../lib/format'

interface Props {
  dialog: UnpublishDialogState
  minReasonLength: number
  canSubmit: boolean
  onReasonChange: (reason: string) => void
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Обязательное подтверждение + reason (AdminPolicyService.requireReason,
 * min 10 символов на сервере) — кнопка "Снять с публикации" остаётся
 * disabled, пока клиентская длина не пройдёт тот же порог (см.
 * useUnpublishAction MIN_REASON_LENGTH), но финальное решение всегда за
 * сервером: canSubmit — только UX-удобство, не замена серверной валидации.
 */
export function UnpublishDialog({ dialog, minReasonLength, canSubmit, onReasonChange, onCancel, onConfirm }: Props) {
  if (dialog.status === 'closed') return null

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unpublish-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="unpublish-dialog-title">Снять публикацию?</h2>
        <p className="dialog-target">
          {sourceTypeLabel(dialog.target.sourceType)} · {dialog.target.city ?? 'город не указан'} · slug: {dialog.target.slug ?? '—'}
        </p>
        <p className="dialog-warning">Действие сразу применится и будет зафиксировано в журнале аудита. Отменить снятие с публикации нельзя — потребуется опубликовать заново.</p>
        <label htmlFor="unpublish-reason">Причина (обязательно, не менее {minReasonLength} символов)</label>
        <textarea
          id="unpublish-reason"
          value={dialog.reason}
          onChange={(event) => onReasonChange(event.target.value)}
          disabled={dialog.submitting}
          rows={3}
          required
        />
        {dialog.status === 'open' && dialog.error ? (
          <p className="dialog-error" role="alert">
            {dialog.error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={dialog.submitting}>
            Отмена
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={!canSubmit}>
            {dialog.status === 'open' && dialog.submitting ? 'Снимаем…' : 'Снять с публикации'}
          </button>
        </div>
      </div>
    </div>
  )
}
