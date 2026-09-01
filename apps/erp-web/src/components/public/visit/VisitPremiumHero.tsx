import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MapPin, MessageCircle, Phone } from 'lucide-react'
import { BazaSaleBrandLogo } from './BazaSaleBrandLogo'
import { useAgencyBranding } from '@/hooks/useAgencyBranding'
import { normalizeVisitStatus, t, type SelectionLanguage } from '@/lib/selection-display'
import { optionLabelRu } from '@/lib/project-options'
import type { UnitShareAgent } from '@/lib/unit-share'
import { hasAgentData, personInitials, resolveAgentPortraitUrl, scrollToVisitSection, splitPersonName } from './visit-utils'
import { VisitPremiumHeroBackdrop } from './VisitPremiumHeroBackdrop'
function statusPillClass(statusKey: string): string {
  return `visit-status-pill visit-status-${normalizeVisitStatus(statusKey)}`
}

export function VisitPremiumHero({
  id,
  agent,
  showAgent,
  showBrand,
  showPrice,
  showStatus,
  complexName,
  location,
  classType,
  unitNumber,
  lotTitle,
  scrollToSectionId,
  scrollCueLabel,
  primaryActionHref,
  primaryActionLabel,
  price,
  pricePerSqm,
  statusLabel,
  statusKey,
  promo,
  formatPrice,
  language,
  backgroundImage,
  projectIntro,
}: {
  id: string
  backgroundImage: string
  agent: UnitShareAgent | null
  showAgent: boolean
  showBrand: boolean
  showPrice: boolean
  showStatus: boolean
  complexName: string
  location: string
  classType?: string
  unitNumber?: string | number
  lotTitle?: string
  scrollToSectionId?: string
  scrollCueLabel?: string
  primaryActionHref?: string
  primaryActionLabel?: string
  price?: number
  pricePerSqm?: number
  statusLabel?: string
  statusKey?: string
  promo?: boolean
  formatPrice: (value: number) => string
  language: SelectionLanguage
  projectIntro?: string
}) {
  const branding = useAgencyBranding()
  const agentVisible = showAgent && hasAgentData(agent)
  const { firstName, lastName } = splitPersonName(agent?.name)
  const portraitName = agent?.name?.trim() || t(language, 'connect')
  const [portraitFailed, setPortraitFailed] = useState(false)
  const portraitSrc = portraitFailed
    ? resolveAgentPortraitUrl(null, portraitName)
    : resolveAgentPortraitUrl(agent, portraitName)
  const heroRef = useRef<HTMLElement>(null)
  const scrollCueRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setPortraitFailed(false)
  }, [agent?.avatarUrl, portraitName])

  const handleScrollCue = () => {
    if (!scrollToSectionId) return
    heroRef.current?.classList.add('is-scrolling-away')
    scrollCueRef.current?.classList.add('is-scrolling')
    scrollToVisitSection(scrollToSectionId)
    window.setTimeout(() => {
      heroRef.current?.classList.remove('is-scrolling-away')
      scrollCueRef.current?.classList.remove('is-scrolling')
    }, 1000)
  }

  return (
    <section ref={heroRef} id={id} className="visit-premium-hero visit-scroll-section relative overflow-hidden">
      <VisitPremiumHeroBackdrop image={backgroundImage} />
      <div className="visit-premium-hero-overlay absolute inset-0" />

      {showBrand && (
        <div className="visit-premium-hero-logo absolute z-20">
          {branding.logoDataUrl ? (
            <span className="visit-premium-brand inline-flex items-center" aria-label={branding.name || undefined}>
              <img
                src={branding.logoDataUrl}
                alt={branding.name || ''}
                className="h-8 w-auto max-w-[180px] object-contain sm:h-9"
              />
            </span>
          ) : (
            <BazaSaleBrandLogo className="visit-premium-brand" />
          )}
        </div>
      )}

      <div className="visit-premium-hero-inner visit-page-container relative z-10 flex flex-col items-center pt-3 sm:pt-4">
        <div className="visit-premium-hero-content flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center sm:max-w-xl">
          <h1 className="visit-premium-hero-text text-[1.375rem] font-light leading-snug tracking-tight sm:text-3xl lg:text-4xl">
            {complexName}
          </h1>
          <div className="visit-premium-hero-muted mt-1.5 flex justify-center text-xs sm:mt-2 sm:text-sm">
            <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} className="shrink-0" />
                {location}
              </span>
              {classType && (
                <span className="visit-premium-chip shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] sm:text-xs">
                  {language === 'ru' ? optionLabelRu('classTypes', classType) : classType}
                </span>
              )}
            </div>
          </div>

          {!unitNumber && lotTitle && (
            <p className="visit-premium-hero-muted mt-1.5 text-sm sm:mt-2 sm:text-base">{lotTitle}</p>
          )}

          {projectIntro && (
            <p className="visit-premium-hero-muted mt-2.5 line-clamp-2 max-w-sm text-center text-xs leading-relaxed sm:text-sm">
              {projectIntro}
            </p>
          )}

          {(showPrice || showStatus || (unitNumber != null && unitNumber !== '')) && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {unitNumber != null && unitNumber !== '' && (
                <p className="visit-premium-hero-gold text-sm font-medium uppercase tracking-[0.15em] sm:text-base">
                  {t(language, 'lotOffer')} {unitNumber}
                </p>
              )}
              {showPrice && price != null && (
                <div className="flex flex-col items-center text-center">
                  <p className="visit-premium-hero-text text-lg font-medium sm:text-xl">
                    {formatPrice(price)}
                  </p>
                  {pricePerSqm != null && (
                    <p className="visit-premium-hero-muted mt-0.5 text-xs sm:text-sm">
                      {formatPrice(pricePerSqm)}/{t(language, 'sqm')}
                    </p>
                  )}
                </div>
              )}
              {showStatus && statusLabel && statusKey && (
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  <span className={`${statusPillClass(statusKey)} rounded-full border px-2.5 py-0.5 text-xs`}>
                    {statusLabel}
                  </span>
                  {promo && (
                    <span className="visit-promo-badge rounded-full border px-2 py-0.5 text-xs">
                      {t(language, 'promo')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {primaryActionHref && primaryActionLabel && (
            <div className="mt-3 flex w-full justify-center">
              <a
                href={primaryActionHref}
                target={primaryActionHref.startsWith('http') ? '_blank' : undefined}
                rel={primaryActionHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="visit-premium-btn-primary inline-flex min-w-[220px] items-center justify-center rounded-xl px-4 py-3 text-sm font-medium sm:text-base"
              >
                {primaryActionLabel}
              </a>
            </div>
          )}

          {agentVisible && agent && (
            <div className="visit-premium-agent-card visit-premium-agent-card-bottom mt-3 w-full rounded-2xl border p-3 text-left sm:p-4">
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-start sm:gap-4">
                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                  <div className="visit-premium-agent-avatar-wrap size-14 shrink-0 sm:size-16">
                    <img
                      src={portraitSrc}
                      alt={portraitName}
                      className="visit-premium-agent-avatar size-full rounded-full object-cover"
                      onError={() => setPortraitFailed(true)}
                    />
                  </div>
                  <div className="min-w-0 text-left">
                    {(firstName || lastName) && (
                      <p className="visit-premium-hero-text text-base font-light tracking-tight sm:text-lg">
                        {firstName}
                        {firstName && lastName ? ' ' : ''}
                        {lastName ? (
                          <span className="visit-premium-hero-gold font-light tracking-wide">{lastName}</span>
                        ) : null}
                      </p>
                    )}
                    {!firstName && !lastName && (
                      <p className="visit-premium-hero-text text-base font-light">
                        {personInitials(agent.name)}
                      </p>
                    )}
                    {(agent.role || agent.company) && (
                      <p className="visit-premium-hero-muted mt-0.5 text-xs sm:text-sm">
                        {[agent.role, agent.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[200px] sm:shrink-0">
                  {agent.phone && (
                    <a
                      href={`tel:${agent.phone}`}
                      className="visit-premium-btn-primary flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium sm:text-sm"
                    >
                      <Phone size={15} />
                      {t(language, 'call')}
                    </a>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {agent.whatsapp && (
                      <a
                        href={`https://wa.me/${agent.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="visit-premium-btn-ghost flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs"
                      >
                        <MessageCircle size={14} />
                        {t(language, 'whatsapp')}
                      </a>
                    )}
                    {agent.telegram && (
                      <a
                        href={`https://t.me/${agent.telegram.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="visit-premium-btn-ghost flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs"
                      >
                        <MessageCircle size={14} />
                        {t(language, 'telegram')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {scrollToSectionId && (
          <div className="visit-hero-scroll-cue-wrap">
            <button
              ref={scrollCueRef}
              type="button"
              className="visit-hero-scroll-cue"
              onClick={handleScrollCue}
              aria-label={scrollCueLabel ?? 'Scroll down'}
            >
              <ChevronDown className="visit-hero-scroll-cue-icon" size={26} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
