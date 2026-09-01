import { Building2, Calendar, Layers, LayoutTemplate, Maximize2, Ruler, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { t, type SelectionLanguage } from '@/lib/selection-display'
import { optionLabelRu, type OptionGroup } from '@/lib/project-options'
import { visitBlockLabel } from '@/lib/unit-visit-block-labels'
import type { FinishType } from '@/types/core'
import { useI18n } from "@/i18n";

function PlanTile({
  url,
  alt,
  emptyIcon,
  emptyMessage,
  onExpand,
}: {
  url?: string | null
  alt: string
  emptyIcon: ReactNode
  emptyMessage: string
  onExpand?: () => void
}) {
    const { t: tApp } = useI18n();
  return (
    <div className="visit-unit-plan-tile">
      <div className="visit-unit-plan-frame">
        <div className="visit-unit-plan-frame-inner relative flex min-h-[200px] items-center justify-center p-4 sm:min-h-[260px] sm:p-6">
          {url ? (
            <>
              <button
                type="button"
                onClick={onExpand}
                className="group relative mx-auto block w-full cursor-zoom-in"
                aria-label={tApp('public.visit.visitUnitPlans.открыть_на_весь_экра')}
              >
                <img
                  src={url}
                  alt={alt}
                  className="mx-auto max-h-[min(48vh,420px)] w-full object-contain transition-opacity group-hover:opacity-90"
                  loading="lazy"
                />
                <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/40 text-white/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <Maximize2 size={14} />
                </span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {emptyIcon}
              <p className="visit-premium-muted text-base sm:text-lg">{emptyMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
    const { t: tApp } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tApp('public.visit.visitUnitPlans.закрыть')}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/80 transition hover:bg-black/70"
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

export type VisitUnitPlansOverview = {
  classType?: string
  completionDate?: string
  developmentStage?: string
  paymentTypes?: string[]
  wallMaterial?: string
  ceilingHeight?: string
  finishTypes?: string[]
}

function hasOverviewContent(overview: VisitUnitPlansOverview): boolean {
  return Boolean(
    overview.classType ||
      overview.completionDate ||
      overview.developmentStage ||
      overview.wallMaterial ||
      overview.ceilingHeight ||
      (overview.paymentTypes?.length ?? 0) > 0 ||
      (overview.finishTypes?.length ?? 0) > 0,
  )
}

export function VisitUnitPlans({
  id,
  planUrl,
  floorPlanUrl,
  unitNumber,
  floor,
  buildingName,
  roomsLabel,
  area,
  floorLabel,
  viewFromWindow,
  ceilingHeight,
  condition,
  finishOptions,
  selectedFinishType,
  onFinishTypeChange,
  language,
  showPlans = true,
  showStats = true,
  showOverview = false,
  overview = {},
  overviewEmptyMessage,
  title,
}: {
  id: string
  planUrl?: string | null
  floorPlanUrl?: string | null
  unitNumber: string | number
  floor: number
  buildingName: string
  roomsLabel: string
  area: number
  floorLabel: string
  viewFromWindow?: string | null
  ceilingHeight?: string | null
  condition?: string | null
  finishOptions?: Array<{ finishType: FinishType; pricePerSqm?: number }>
  selectedFinishType?: FinishType | null
  onFinishTypeChange?: (finishType: FinishType) => void
  language: SelectionLanguage
  showPlans?: boolean
  showStats?: boolean
  showOverview?: boolean
  overview?: VisitUnitPlansOverview
  overviewEmptyMessage?: string
  title?: string
}) {
    const { t: tApp } = useI18n();
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  // Значения опций приходят каноническими слагами; для русского языка визитки
  // показываем русскую подпись, для остальных — канонический вариант.
  const optLabel = (group: OptionGroup, value: string) =>
    language === 'ru' ? optionLabelRu(group, value) : value

  const stats = [
    { label: t(language, 'block'), value: buildingName },
    { label: t(language, 'roomsLabel'), value: roomsLabel },
    { label: t(language, 'area'), value: `${area} ${t(language, 'sqm')}` },
    { label: t(language, 'floorLabel'), value: floorLabel },
    viewFromWindow ? { label: t(language, 'windowView'), value: optLabel('views', viewFromWindow) } : null,
    ceilingHeight ? { label: t(language, 'ceilings'), value: optLabel('ceilingHeights', ceilingHeight) } : null,
    condition && !finishOptions?.length ? { label: t(language, 'condition'), value: condition } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  const overviewFilled = hasOverviewContent(overview)
  const sectionTitle = showPlans
    ? visitBlockLabel(language, 'unitPlan')
    : visitBlockLabel(language, 'projectOverview')

  return (
    <>
    {lightbox && <PlanLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <h2 className="visit-premium-section-label text-left text-sm font-normal uppercase tracking-[0.22em] sm:text-base">
        {title ?? sectionTitle}
      </h2>

      {(showPlans || showOverview) && (
        <div className="visit-section-content visit-inner-stack">
          {showPlans && (
            <>
              {(showStats || (finishOptions?.length ?? 0) > 0) && (
                <div className="visit-unit-plans-stats grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  {showStats &&
                    stats.map(({ label, value }) => (
                      <div key={label} className="visit-unit-plan-stat rounded-xl px-2.5 py-2.5 sm:px-3 sm:py-3 stagger-item">
                        <p className="visit-unit-plan-stat-label text-[9px] uppercase tracking-[0.14em] sm:text-[10px]">
                          {label}
                        </p>
                        <p className="visit-unit-plan-stat-value mt-1 text-sm font-light sm:text-base">{value}</p>
                      </div>
                    ))}
                  {finishOptions && finishOptions.length > 0 && (
                    <label className="visit-unit-plan-stat rounded-xl px-2.5 py-2.5 sm:px-3 sm:py-3">
                      <span className="visit-unit-plan-stat-label block text-[16px] uppercase tracking-[0.08em]">
                        {t(language, 'condition')}
                      </span>
                      {finishOptions.length > 1 ? (
                        <select
                          aria-label={tApp('public.visit.visitUnitPlans.выбрать_кондицию_отд')}
                          value={selectedFinishType ?? finishOptions[0].finishType}
                          onChange={(event) => onFinishTypeChange?.(event.target.value as FinishType)}
                          className="premium-select mt-1 h-10 w-full rounded-[12px] bg-transparent px-1 text-[16px] outline-none"
                        >
                          {finishOptions.map((option) => (
                            <option key={option.finishType} value={option.finishType}>
                              {optLabel('finishTypes', option.finishType)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="visit-unit-plan-stat-value mt-1 block text-[16px]">
                          {optLabel('finishTypes', finishOptions[0].finishType)}
                        </span>
                      )}
                    </label>
                  )}
                </div>
              )}

              <div className="visit-unit-plans-grid grid gap-4 sm:grid-cols-2 sm:gap-8">
                <PlanTile
                  url={planUrl}
                  alt={`${visitBlockLabel(language, 'unitPlan')} ${unitNumber}`}
                  emptyIcon={<LayoutTemplate size={44} className="visit-icon-dim opacity-40" />}
                  emptyMessage={t(language, 'layoutNotUploaded')}
                  onExpand={planUrl ? () => setLightbox({ src: planUrl, alt: `${visitBlockLabel(language, 'unitPlan')} ${unitNumber}` }) : undefined}
                />
                <PlanTile
                  url={floorPlanUrl}
                  alt={`${t(language, 'floorLabel')} ${floor}`}
                  emptyIcon={<Layers size={44} className="visit-icon-dim opacity-40" />}
                  emptyMessage={t(language, 'floorPlanNotUploaded')}
                  onExpand={floorPlanUrl ? () => setLightbox({ src: floorPlanUrl, alt: `${t(language, 'floorLabel')} ${floor}` }) : undefined}
                />
              </div>
            </>
          )}

          {showOverview && (
            <>
              {showPlans && (
                <h3 className="visit-premium-section-label text-left text-xs font-normal uppercase tracking-[0.2em] sm:text-sm">
                  {visitBlockLabel(language, 'projectOverview')}
                </h3>
              )}
              {overviewFilled ? (
                <div className="visit-unit-plan-stat visit-unit-overview-panel flex flex-wrap gap-2 rounded-xl px-4 py-4 sm:px-5 sm:py-5">
                  {overview.classType && (
                    <span className="visit-premium-pill rounded-full px-3 py-1.5 text-sm sm:text-base">
                      {optLabel('classTypes', overview.classType)}
                    </span>
                  )}
                  {overview.completionDate && (
                    <span className="visit-premium-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm sm:text-base">
                      <Calendar size={14} />
                      {t(language, 'completion')}: {overview.completionDate}
                    </span>
                  )}
                  {overview.developmentStage && (
                    <span className="visit-pill rounded-full border px-3 py-1.5 text-sm sm:text-base">
                      {overview.developmentStage}
                    </span>
                  )}
                  {overview.paymentTypes?.map((p) => (
                    <span key={p} className="visit-premium-pill rounded-full px-3 py-1.5 text-sm sm:text-base">
                      {optLabel('paymentTypes', p)}
                    </span>
                  ))}
                  {overview.wallMaterial && (
                    <span className="visit-premium-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm sm:text-base">
                      <Building2 size={14} />
                      {optLabel('wallMaterials', overview.wallMaterial)}
                    </span>
                  )}
                  {overview.ceilingHeight && (
                    <span className="visit-premium-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm sm:text-base">
                      <Ruler size={14} />
                      {t(language, 'ceilings')} {optLabel('ceilingHeights', overview.ceilingHeight)}
                    </span>
                  )}
                  {overview.finishTypes?.map((f) => (
                    <span key={f} className="visit-premium-pill rounded-full px-3 py-1.5 text-sm sm:text-base">
                      {optLabel('finishTypes', f)}
                    </span>
                  ))}
                </div>
              ) : (
                overviewEmptyMessage && (
                  <p className="visit-premium-muted text-base leading-relaxed sm:text-lg">{overviewEmptyMessage}</p>
                )
              )}
            </>
          )}
        </div>
      )}
    </section>
    </>
  )
}
