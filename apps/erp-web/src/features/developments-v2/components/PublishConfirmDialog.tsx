import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface PublishConfirmDialogProps {
  developmentName: string
  open: boolean
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** D-03: подтверждение перед publish — критичное действие, необратимое одним кликом. */
export function PublishConfirmDialog({ developmentName, open, submitting, onConfirm, onCancel }: PublishConfirmDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Подтверждение публикации"
      onClick={() => !submitting && onCancel()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-md bg-[var(--green-card)] p-6 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]"
      >
        <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Опубликовать ЖК?</h2>
        <p className="mt-3 text-[16px] font-normal text-[color:var(--app-text-muted)]">
          Опубликовать «{developmentName}»? После публикации ЖК появится в маркетплейсе.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            data-testid="publish-confirm-button"
            className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)] disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitting ? 'Публикуем…' : 'Опубликовать'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-sm border border-[color:var(--green-border)] bg-transparent px-5 py-2.5 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)] disabled:opacity-60"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
