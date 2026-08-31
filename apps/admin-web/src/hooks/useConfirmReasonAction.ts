import { useCallback, useState } from 'react'
import { AdminApiError } from '../api/admin-api'

export type ConfirmReasonDialogState<TTarget> =
  | { status: 'closed' }
  | { status: 'open'; target: TTarget; reason: string; submitting: false; error: string | null }
  | { status: 'open'; target: TTarget; reason: string; submitting: true; error: null }

// AdminPolicyService.requireReason на сервере — тот же порог 10 символов,
// что useUnpublishAction, для всех остальных опасных admin-действий
// (деактивация/реактивация аккаунта, отзыв granta). Клиентская проверка —
// только UX, сервер остаётся источником истины.
const MIN_REASON_LENGTH = 10

/**
 * Общий hook для confirm+reason опасных действий (деактивация/реактивация
 * аккаунта, отзыв granta) — тот же паттерн, что useUnpublishAction, но
 * параметризован по target/submit-функции, чтобы не дублировать
 * open/close/setReason/canSubmit логику ещё дважды.
 */
export function useConfirmReasonAction<TTarget, TResult>(
  submitAction: (target: TTarget, reason: string) => Promise<TResult>,
  onSuccess: (result: TResult, target: TTarget) => void,
) {
  const [dialog, setDialog] = useState<ConfirmReasonDialogState<TTarget>>({ status: 'closed' })

  const open = useCallback((target: TTarget) => {
    setDialog({ status: 'open', target, reason: '', submitting: false, error: null })
  }, [])

  const close = useCallback(() => {
    setDialog({ status: 'closed' })
  }, [])

  const setReason = useCallback((reason: string) => {
    setDialog((current) => (current.status === 'open' && !current.submitting ? { ...current, reason } : current))
  }, [])

  const canSubmit = dialog.status === 'open' && !dialog.submitting && dialog.reason.trim().length >= MIN_REASON_LENGTH

  const submit = useCallback(async () => {
    if (dialog.status !== 'open' || dialog.submitting) return
    if (dialog.reason.trim().length < MIN_REASON_LENGTH) return
    const { target, reason } = dialog
    setDialog({ status: 'open', target, reason, submitting: true, error: null })
    try {
      const result = await submitAction(target, reason.trim())
      setDialog({ status: 'closed' })
      onSuccess(result, target)
    } catch (cause) {
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось выполнить действие. Попробуйте ещё раз.'
      setDialog({ status: 'open', target, reason, submitting: false, error: message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, submitAction, onSuccess])

  return { dialog, open, close, setReason, submit, canSubmit, minReasonLength: MIN_REASON_LENGTH }
}
