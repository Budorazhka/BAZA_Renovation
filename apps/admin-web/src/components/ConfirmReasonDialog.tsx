import type { ConfirmReasonDialogState } from '../hooks/useConfirmReasonAction'

interface Props<TTarget> {
  dialog: ConfirmReasonDialogState<TTarget>
  title: string
  renderTarget: (target: TTarget) => string
  warning: string
  confirmLabel: string
  confirmingLabel: string
  minReasonLength: number
  canSubmit: boolean
  onReasonChange: (reason: string) => void
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Общий confirm+reason диалог для опасных admin-действий (деактивация/
 * реактивация аккаунта, отзыв granta) — тот же UX-контракт, что
 * UnpublishDialog: обязательная причина ≥minReasonLength, disabled кнопка
 * подтверждения до прохождения порога, loading-текст во время submit,
 * ошибка сервера показывается как есть. Параметризован, а не третья копия
 * того же JSX — единственная разница между действиями — заголовок/
 * предупреждение/подпись кнопки.
 */
export function ConfirmReasonDialog<TTarget>({
  dialog,
  title,
  renderTarget,
  warning,
  confirmLabel,
  confirmingLabel,
  minReasonLength,
  canSubmit,
  onReasonChange,
  onCancel,
  onConfirm,
}: Props<TTarget>) {
  if (dialog.status === 'closed') return null

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-reason-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-reason-dialog-title">{title}</h2>
        <p className="dialog-target">{renderTarget(dialog.target)}</p>
        <p className="dialog-warning">{warning}</p>
        <label htmlFor="confirm-reason-input">Причина (обязательно, не менее {minReasonLength} символов)</label>
        <textarea
          id="confirm-reason-input"
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
            {dialog.status === 'open' && dialog.submitting ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
