import { useCallback, useState } from 'react'
import { adminApi, AdminApiError } from '../api/admin-api'
import type { AdminPublicationListItem, UnpublishResult } from '../types/admin'

export type UnpublishDialogState =
  | { status: 'closed' }
  | { status: 'open'; target: AdminPublicationListItem; reason: string; submitting: false; error: string | null }
  | { status: 'open'; target: AdminPublicationListItem; reason: string; submitting: true; error: null }

// AdminPolicyService.requireReason на сервере (apps/api) — тот же порог,
// проверяется здесь только для немедленной UX-обратной связи; сервер
// остаётся источником истины (см. docs/operations/admin-control-plane.md).
const MIN_REASON_LENGTH = 10

export function useUnpublishAction(onSuccess: (result: UnpublishResult) => void) {
  const [dialog, setDialog] = useState<UnpublishDialogState>({ status: 'closed' })

  const open = useCallback((target: AdminPublicationListItem) => {
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
      const result = await adminApi.unpublish(target.id, reason.trim())
      setDialog({ status: 'closed' })
      onSuccess(result)
    } catch (cause) {
      const message = cause instanceof AdminApiError ? cause.message : 'Не удалось снять публикацию. Попробуйте ещё раз.'
      setDialog({ status: 'open', target, reason, submitting: false, error: message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, onSuccess])

  return { dialog, open, close, setReason, submit, canSubmit, minReasonLength: MIN_REASON_LENGTH }
}
