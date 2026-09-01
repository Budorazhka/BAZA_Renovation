import { Link, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

type AccessDeniedState = { sectionId?: string | null; sectionLabel?: string }

/**
 * Показ при переходе на URL без прав (роль или матрица категорий).
 */
export function DashboardAccessDeniedPage() {
  const { state } = useLocation()
  const { t } = useI18n()
  const { sectionId, sectionLabel } = (state as AccessDeniedState | null) ?? {}
  const displaySectionLabel = sectionId ? t(`nav.${sectionId}`, sectionLabel) : sectionLabel

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="rounded-xl border border-[color:var(--green-border)]/35 bg-[color:var(--green-card)] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.1)] sm:px-8 sm:py-8">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--gold)_8%,transparent)]">
          <Lock className="size-5 text-[color:var(--app-text-muted)]" strokeWidth={2} />
        </div>
        <p className="mb-3 text-[11px] font-normal uppercase tracking-[0.12em] text-[color:var(--app-text-muted)]">
          {t('accessDenied.eyebrow')}
        </p>
        <h1 className="text-[1.4rem] font-normal leading-tight tracking-tight text-[color:var(--app-text)] sm:text-[1.65rem]">
          {t('accessDenied.title')}
        </h1>
        {displaySectionLabel ? (
          <p className="mt-3 text-[16px] text-[color:var(--theme-accent-heading)]">
            {displaySectionLabel}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/dashboard">{t('accessDenied.toDashboard')}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
