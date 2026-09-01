import { useEffect, useMemo, useState } from 'react'

import { UnitInstallmentScheduleView } from '@/components/inventory/UnitInstallmentScheduleView'
import type { InstallmentRowModel } from '@/components/development/sales/salesInstallmentsShared'
import {
  defaultVisitPaymentMode,
  resolveVisitPaymentModes,
  visitPaymentModeLabel,
  type VisitPaymentMode,
} from '@/lib/payment-types'
import { t, type SelectionLanguage } from '@/lib/selection-display'
import { visitBlockLabel } from '@/lib/unit-visit-block-labels'
import { cn } from '@/lib/utils'

export function VisitPaymentSection({
  id,
  paymentTypes,
  installmentRows,
  listPrice,
  pricePerSqm,
  pricePerSqmLabel,
  formatAmount,
  language,
  title,
}: {
  id: string
  paymentTypes: string[]
  installmentRows: InstallmentRowModel[]
  listPrice: number
  pricePerSqm?: number | null
  pricePerSqmLabel?: string | null
  formatAmount: (value: number) => string
  language: SelectionLanguage
  title?: string
}) {
  const modes = useMemo(() => resolveVisitPaymentModes(paymentTypes), [paymentTypes])
  const hasInstallmentSchedule = installmentRows.length > 0
  const [activeMode, setActiveMode] = useState<VisitPaymentMode>(() =>
    defaultVisitPaymentMode(modes, hasInstallmentSchedule),
  )

  useEffect(() => {
    setActiveMode(defaultVisitPaymentMode(modes, hasInstallmentSchedule))
  }, [modes, hasInstallmentSchedule])

  const showTabs = modes.length > 1

  return (
    <section id={id} className="visit-premium-section visit-scroll-section scroll-mt-6 reveal-section">
      <h2 className="visit-premium-section-label text-left text-sm font-normal uppercase tracking-[0.22em] sm:text-base">
        {title ?? visitBlockLabel(language, 'paymentPlans')}
      </h2>

      <div className="visit-section-content visit-premium-panel overflow-hidden">
        {showTabs && (
          <div className="unit-installment-landing">
            <div
              className="installment-variant-tabs flex w-full shrink-0 overflow-x-auto border-b visit-border-b sm:grid sm:overflow-visible"
              style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
            >
              {modes.map((mode, index) => {
                const isActive = mode === activeMode
                const isLast = index === modes.length - 1
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveMode(mode)}
                    className={cn(
                      'installment-variant-tab flex min-h-[44px] min-w-[7.5rem] shrink-0 items-center justify-center px-3 py-2 text-center text-xs leading-snug transition sm:min-h-[48px] sm:min-w-0 sm:shrink sm:px-3 sm:py-2.5 sm:text-sm',
                      !isLast && 'border-r visit-border-b',
                      isActive ? 'is-active' : 'hover:opacity-90',
                    )}
                  >
                    {visitPaymentModeLabel(language, mode)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {activeMode === 'installment' ? (
          hasInstallmentSchedule ? (
            <UnitInstallmentScheduleView
              variant="landing"
              rows={installmentRows}
              listPrice={listPrice}
              pricePerSqm={pricePerSqm}
              pricePerSqmLabel={pricePerSqmLabel}
              formatAmount={formatAmount}
            />
          ) : (
            <p className="visit-premium-muted flex min-h-[220px] items-center justify-center px-6 py-12 text-center text-base">
              {t(language, 'installmentNotConfigured')}
            </p>
          )
        ) : listPrice > 0 ? (
          <div className="px-4 py-6 sm:px-7 sm:py-8">
            <div className="visit-unit-plan-stat rounded-xl px-4 py-4 sm:px-5 sm:py-5 stagger-item">
              <p className="visit-unit-plan-stat-label text-[9px] uppercase tracking-[0.14em] sm:text-[10px]">
                {t(language, 'price')}
              </p>
              <p className="visit-unit-plan-stat-value mt-2 text-2xl font-light sm:text-3xl">
                {formatAmount(Math.round(listPrice))}
              </p>
              {pricePerSqmLabel && (
                <p className="visit-premium-muted mt-2 text-sm sm:text-base">{pricePerSqmLabel}</p>
              )}
            </div>
            <p className="visit-premium-muted mt-4 text-sm leading-relaxed sm:text-base">
              {t(language, 'fullPaymentHint')}
            </p>
          </div>
        ) : (
          <p className="visit-premium-muted flex min-h-[220px] items-center justify-center px-6 py-12 text-center text-base">
            {t(language, 'priceOnRequest')}
          </p>
        )}
      </div>
    </section>
  )
}
