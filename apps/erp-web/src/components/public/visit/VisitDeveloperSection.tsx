import { t, type SelectionLanguage } from '@/lib/selection-display'
import type { VisitDeveloperInfo } from '@/lib/visit-location-content'
import { personInitials } from './visit-utils'

export function VisitDeveloperSection({
  id,
  developer,
  language,
  title,
  showLogo = true,
  showCompanyName = true,
}: {
  id: string
  developer: VisitDeveloperInfo
  language: SelectionLanguage
  title?: string
  showLogo?: boolean
  showCompanyName?: boolean
}) {
  if (!developer.name && !developer.description && !developer.website) return null

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <h2 className="visit-premium-section-label text-left text-sm font-normal uppercase tracking-[0.22em] sm:text-base">
        {title ?? t(language, 'developer')}
      </h2>
      <div className="visit-section-content visit-unit-plan-stat visit-developer-panel flex items-start gap-3 rounded-xl px-3.5 py-4 sm:gap-5 sm:px-5 sm:py-6">
        {showLogo && (
          <div className="visit-premium-dev-avatar flex size-14 shrink-0 items-center justify-center border text-sm sm:size-20">
            {developer.image ? (
              <img src={developer.image} alt={developer.name} className="size-full object-cover" />
            ) : (
              personInitials(developer.name)
            )}
          </div>
        )}
        <div className="min-w-0">
          {showCompanyName && developer.name && (
            <p className="visit-premium-title text-lg font-light tracking-tight sm:text-2xl">{developer.name}</p>
          )}
          {developer.description && (
            <p className={`visit-premium-muted text-base leading-relaxed sm:text-lg ${showCompanyName && developer.name ? 'mt-2' : ''}`}>
              {developer.description}
            </p>
          )}
          {developer.website && (
            <a
              href={developer.website}
              target="_blank"
              rel="noopener noreferrer"
              className="visit-unit-plan-stat-value mt-3 inline-block text-sm hover:underline"
            >
              {developer.website.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
