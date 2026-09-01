import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { MailingsEditor } from '@/components/mailings/MailingsEditor'
import { useDashboard } from '@/context/DashboardContext'
import { getCountryByCityId } from '@/data/mock'
import type { Mailing } from '@/types/mailings'
import { Button } from '@/components/ui/button'
import { useI18n } from "@/i18n";

export default function MailingsManagementSettingsPage() {
    const { t } = useI18n();
  const { state, dispatch } = useDashboard()
  const city = state.cities[0]
  const country = city ? getCountryByCityId(city.id) : undefined
  const allPartners = state.cities.flatMap((c) => c.partners)

  const handleAddMailing = (mailing: Mailing) => {
    dispatch({ type: 'ADD_MAILING', mailing })
  }

  const handleCancelScheduledMailing = (mailingId: string) => {
    dispatch({ type: 'CANCEL_SCHEDULED_MAILING', mailingId })
  }

  if (!city) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[var(--app-bg)] p-8 text-[color:var(--app-text)]">
        <p className="text-[color:var(--app-text-muted)]">{t('modules.mailingsManagementSettingsPage.нет_городов_в_демо_д')}</p>
        <Button variant="outline" asChild className="border-[var(--green-border)] text-[color:var(--app-text)]">
          <Link to="/dashboard/settings/news-mailings">{t('modules.mailingsManagementSettingsPage.назад')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-full space-y-6 bg-[var(--app-bg)] p-6 text-[color:var(--app-text)] lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="shrink-0 text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)] hover:text-[color:var(--app-text)]"
          >
            <Link to="/dashboard/settings/news-mailings" aria-label={t('modules.mailingsManagementSettingsPage.назад')}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-normal tracking-tight text-[color:var(--app-text)]">{t('modules.mailingsManagementSettingsPage.рассылки')}</h1>
            <p className="text-[color:var(--app-text-muted)]">
              {country?.name ? `${country.name} · ` : ''}
              {city.name} {t('modules.mailingsManagementSettingsPage.аудитория_и_каналы')}</p>
          </div>
        </div>
      </div>

      <MailingsEditor
        city={city}
        country={country}
        cities={state.cities}
        allPartners={allPartners}
        mailings={state.mailings}
        onAddMailing={handleAddMailing}
        onCancelScheduled={handleCancelScheduledMailing}
      />
    </div>
  )
}
