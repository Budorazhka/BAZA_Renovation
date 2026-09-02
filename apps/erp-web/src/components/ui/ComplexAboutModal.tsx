import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'

import { developmentApi, type Building, type Complex } from '@/services/developmentApi'
import { optionLabel, optionLabels, type OptionGroup } from '@/lib/project-options'
import { useI18n } from "@/i18n";

export interface ComplexAboutFallback {
  id: string
  name: string
  developer?: string
  city?: string
  country?: string
  address?: string
  delivery?: string
  priceFrom?: string
  priceTo?: string
  totalUnits?: number
  freeUnits?: number
  soldUnits?: number
  floorsFrom?: number
  floorsTo?: number
  areaFrom?: number
  areaTo?: number
  apartments?: number
  /** Комиссия агента по этому ЖК (главное для риэлтора). */
  commission?: { beforeTax: number; afterTax: number; bonus?: string }
  /** Акции и бонусы на карточке (ТОП, BMW в подарок и т.п.). */
  promos?: string[]
}

interface ComplexAboutModalProps {
  complexId: string
  fallback: ComplexAboutFallback
  onClose: () => void
}

function yesNo(value?: boolean): string | undefined {
  return typeof value === 'boolean' ? (value ? 'Есть' : 'Нет') : undefined
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364]">{title}</h3>
      {children}
    </section>
  )
}

function Paragraph({ text }: { text: string }) {
  return <p className="max-w-[68ch] whitespace-pre-line text-[16px] leading-relaxed text-[rgba(255,255,255,0.82)]">{text}</p>
}

function SpecGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return null
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-1">
          <span className="text-[16px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">{label}</span>
          <span className="text-[16px] text-[#fcecc8]">{value}</span>
        </div>
      ))}
    </div>
  )
}

function LabeledLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[16px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.55)]">{label}</span>
      <span className="text-[16px] text-[#fcecc8]">{value}</span>
    </div>
  )
}

export function ComplexAboutModal({ complexId, fallback, onClose }: ComplexAboutModalProps) {
    const { t } = useI18n();
  const [complex, setComplex] = useState<Complex | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('about')

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    setBuildings([])
    developmentApi
      .getComplexPassport(complexId)
      .then((resp) => {
        if (!active) return
        if (resp.success && resp.data) setComplex(resp.data)
        else setFailed(true)
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false))
    developmentApi
      .getBuildings(complexId)
      .then((resp) => {
        if (active && resp.success && Array.isArray(resp.data)) setBuildings(resp.data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [complexId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const c = complex
  const title = c?.name || fallback.name
  const developer = c?.developer || fallback.developer
  const joinLabels = (group: OptionGroup, values?: string[]): string | undefined =>
    optionLabels(t, group, values).join(', ') || undefined
  const geo = [optionLabel(t, 'countries', c?.country ?? fallback.country), optionLabel(t, 'cities', c?.city ?? fallback.city)]
    .filter(Boolean)
    .join(', ')

  // ─── Характеристики ──────────────────────────────────────────────────────
  const priceRange = [fallback.priceFrom, fallback.priceTo].filter(Boolean).join(' — ') || undefined
  const floorsRange =
    typeof fallback.floorsFrom === 'number' && typeof fallback.floorsTo === 'number'
      ? `${fallback.floorsFrom}–${fallback.floorsTo} эт.`
      : undefined
  const areaRange =
    typeof fallback.areaFrom === 'number' && typeof fallback.areaTo === 'number'
      ? `${fallback.areaFrom}–${fallback.areaTo} м²`
      : undefined
  const apartmentsCount = fallback.apartments ?? fallback.totalUnits
  const availability =
    typeof fallback.freeUnits === 'number' && typeof fallback.totalUnits === 'number'
      ? `${fallback.freeUnits} из ${fallback.totalUnits}`
      : undefined

  const specRows = (
    [
      { label: 'Сдача', value: c?.completionDate ?? fallback.delivery },
      { label: 'Цены', value: priceRange },
      { label: 'Этажность', value: floorsRange },
      { label: 'Площадь квартир', value: areaRange },
      { label: 'Квартир', value: typeof apartmentsCount === 'number' && apartmentsCount > 0 ? `${apartmentsCount}` : undefined },
      { label: 'Свободно', value: availability },
      { label: 'Класс', value: c?.class ? optionLabel(t, 'classTypes', c.class) : undefined },
      { label: 'Тип объекта', value: joinLabels('propertyTypes', c?.propertyType) },
      { label: 'Материал стен', value: c?.wallMaterial ? optionLabel(t, 'wallMaterials', c.wallMaterial) : undefined },
      { label: 'Высота потолков', value: c?.ceilingHeight ? optionLabel(t, 'ceilingHeights', c.ceilingHeight) : undefined },
      { label: 'Лифты', value: joinLabels('elevatorTypes', c?.elevatorTypes) },
      { label: 'Газ', value: yesNo(c?.hasGas) },
      {
        label: 'Паркинг',
        value: [joinLabels('parkingTypes', c?.parkingTypes), c?.parkingSpots ? `${c.parkingSpots} мест` : undefined]
          .filter(Boolean)
          .join(' · ') || undefined,
      },
      { label: 'Водоснабжение', value: c?.waterSupply ? optionLabel(t, 'waterSupply', c.waterSupply) : undefined },
      { label: 'Канализация', value: c?.sewerage ? optionLabel(t, 'sewerage', c.sewerage) : undefined },
      { label: 'Береговая линия', value: c?.coastline ? optionLabel(t, 'coastline', c.coastline) : undefined },
      { label: 'Разрешение на строительство', value: yesNo(c?.buildingPermit) },
      { label: 'Варианты отделки', value: joinLabels('finishTypes', c?.finishTypes) },
      { label: 'Виды из окон', value: joinLabels('views', c?.viewTypes) },
      { label: 'Начало строительства', value: c?.startDate },
    ] as Array<{ label: string; value?: string }>
  ).filter((row): row is { label: string; value: string } => Boolean(row.value))

  const buildingRows = buildings.map((b, idx) => {
    const detail = [
      typeof b.floors === 'number' ? `${b.floors} эт.` : null,
      b.completionDate ? `сдача ${b.completionDate}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return { key: b.id || `b${idx}`, name: b.name || b.number || `Корпус ${idx + 1}`, detail }
  })

  // ─── Условия и комиссия ──────────────────────────────────────────────────
  const paymentTypes = joinLabels('paymentTypes', c?.paymentTypes)
  const installments = (c?.installmentTerms ?? [])
    .map((t, idx) => {
      const detail = [
        typeof t.downPaymentPercent === 'number' ? `первый взнос ${t.downPaymentPercent}%` : null,
        typeof t.durationMonths === 'number' ? `срок ${t.durationMonths} мес.` : null,
      ]
        .filter(Boolean)
        .join(', ')
      return { key: `inst${idx}`, label: t.type?.trim() || 'Рассрочка', detail }
    })
    .filter((t) => t.detail)
  const mortgage = c?.mortgageTerm
  const mortgageText = mortgage
    ? [
        typeof mortgage.interestRateMin === 'number' ? `ставка от ${mortgage.interestRateMin}%` : null,
        typeof mortgage.downPaymentPercent === 'number' ? `первый взнос ${mortgage.downPaymentPercent}%` : null,
        typeof mortgage.maxTermYears === 'number' ? `до ${mortgage.maxTermYears} лет` : null,
      ]
        .filter(Boolean)
        .join(', ') || undefined
    : undefined

  const fmtCommission = (n: number) => `${n.toFixed(2).replace('.', ',')}%`
  const commissionRows = fallback.commission
    ? ([
        { label: 'До налогов', value: fmtCommission(fallback.commission.beforeTax) },
        { label: 'После налогов', value: fmtCommission(fallback.commission.afterTax) },
      ] as Array<{ label: string; value: string }>)
    : []
  const commissionBonus = fallback.commission?.bonus?.trim()
  const promos = (fallback.promos ?? []).map((p) => p.trim()).filter(Boolean)

  // ─── Инвестиции ──────────────────────────────────────────────────────────
  const yieldRows = (
    [
      {
        label: 'Краткосрочная аренда',
        value: typeof c?.rentalYieldShort === 'number' ? `${c.rentalYieldShort}% годовых` : undefined,
      },
      {
        label: 'Долгосрочная аренда',
        value: typeof c?.rentalYieldLong === 'number' ? `${c.rentalYieldLong}% годовых` : undefined,
      },
      {
        label: 'Рост стоимости',
        value: typeof c?.investmentYield === 'number' ? `${c.investmentYield}%` : undefined,
      },
    ] as Array<{ label: string; value?: string }>
  ).filter((row): row is { label: string; value: string } => Boolean(row.value))
  const rentalText = c?.rentalText?.trim()
  const investmentText = c?.investmentText?.trim()

  // ─── О проекте ───────────────────────────────────────────────────────────
  const districtText = c?.districtText?.trim()
  const infraInternal = joinLabels('infraInternal', c?.infrastructureInternal)
  const infraExternal = joinLabels('infraExternal', c?.infrastructureExternal)
  const infraLocation = joinLabels('infraLocation', c?.infrastructureLocation)
  const hasInfra = Boolean(infraInternal || infraExternal || infraLocation)

  // ─── Скрипты продаж ──────────────────────────────────────────────────────
  const scripts = (c?.realtorScripts ?? []).filter((s) => s.question?.trim() || s.answer?.trim())

  // ─── Вкладки ─────────────────────────────────────────────────────────────
  const hasAbout = Boolean(
    c?.description?.trim() || c?.descriptionSuccess?.trim() || c?.descriptionAudience?.trim() || districtText || hasInfra,
  )
  const hasSpecs = specRows.length > 0 || buildingRows.length > 0
  const hasTerms =
    Boolean(paymentTypes) || installments.length > 0 || Boolean(mortgageText) || commissionRows.length > 0 || promos.length > 0
  const hasInvest = yieldRows.length > 0 || Boolean(rentalText) || Boolean(investmentText)
  const hasScripts = scripts.length > 0

  const tabs = [
    { id: 'about', label: 'О проекте', show: hasAbout },
    { id: 'specs', label: 'Характеристики', show: hasSpecs },
    { id: 'terms', label: 'Условия и комиссия', show: hasTerms },
    { id: 'invest', label: 'Инвестиции', show: hasInvest },
    { id: 'scripts', label: 'Скрипты продаж', show: hasScripts },
  ].filter((t) => t.show)

  const activeId = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(8,12,10,0.78)] p-4"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(88vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-[8px] bg-[#0f2318] shadow-[0_24px_60px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(201,168,76,0.2)]"
      >
        <header className="flex items-start justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[24px] font-normal text-[#e6c364]">{title}</h2>
            <p className="mt-1 text-[16px] text-[rgba(255,255,255,0.72)]">
              {[developer, geo].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.complexAboutModal.закрыть')}
            className="flex size-9 shrink-0 items-center justify-center rounded-[6px] text-[rgba(242,207,141,0.7)] transition-colors hover:bg-[rgba(201,168,76,0.12)] hover:text-[#fcecc8]"
          >
            <X size={18} />
          </button>
        </header>

        {tabs.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-6 pb-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 rounded-[4px] px-3.5 py-2 text-[16px] transition-colors ${
                  activeId === t.id
                    ? 'bg-[rgba(201,168,76,0.14)] text-[#e6c364]'
                    : 'text-[rgba(255,255,255,0.72)] hover:bg-[rgba(201,168,76,0.06)] hover:text-[#fcecc8]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-[16px] text-[rgba(255,255,255,0.72)]">
              <Loader2 size={18} className="animate-spin" />
              {t('ui.complexAboutModal.загружаем_данные_по')}</div>
          ) : tabs.length === 0 ? (
            <p className="py-10 text-center text-[16px] text-[rgba(255,255,255,0.72)]">
              {failed
                ? 'Не удалось загрузить подробную информацию по проекту.'
                : 'По этому проекту пока нет заполненной информации.'}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {activeId === 'about' && (
                <>
                  {c?.description?.trim() && (
                    <Section title={t('ui.complexAboutModal.описание')}>
                      <Paragraph text={c.description.trim()} />
                    </Section>
                  )}
                  {c?.descriptionSuccess?.trim() && (
                    <Section title={t('ui.complexAboutModal.почему_стоит_купить')}>
                      <Paragraph text={c.descriptionSuccess.trim()} />
                    </Section>
                  )}
                  {c?.descriptionAudience?.trim() && (
                    <Section title={t('ui.complexAboutModal.целевая_аудитория')}>
                      <Paragraph text={c.descriptionAudience.trim()} />
                    </Section>
                  )}
                  {districtText && (
                    <Section title={t('ui.complexAboutModal.о_районе')}>
                      <Paragraph text={districtText} />
                    </Section>
                  )}
                  {hasInfra && (
                    <Section title={t('ui.complexAboutModal.инфраструктура')}>
                      <div className="flex flex-col gap-3">
                        {infraInternal && <LabeledLine label={t('ui.complexAboutModal.на_территории')} value={infraInternal} />}
                        {infraExternal && <LabeledLine label={t('ui.complexAboutModal.рядом')} value={infraExternal} />}
                        {infraLocation && <LabeledLine label={t('ui.complexAboutModal.локация')} value={infraLocation} />}
                      </div>
                    </Section>
                  )}
                </>
              )}

              {activeId === 'specs' && (
                <>
                  {specRows.length > 0 && (
                    <Section title={t('ui.complexAboutModal.характеристики')}>
                      <SpecGrid rows={specRows} />
                    </Section>
                  )}
                  {buildingRows.length > 0 && (
                    <Section title={`Корпуса · ${buildingRows.length}`}>
                      <div className="flex flex-col gap-2">
                        {buildingRows.map((b) => (
                          <div key={b.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="text-[16px] text-[#fcecc8]">{b.name}</span>
                            {b.detail && <span className="text-[16px] text-[rgba(255,255,255,0.72)]">{b.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </>
              )}

              {activeId === 'terms' && (
                <>
                  {paymentTypes && (
                    <Section title={t('ui.complexAboutModal.способы_оплаты')}>
                      <p className="text-[16px] text-[#fcecc8]">{paymentTypes}</p>
                    </Section>
                  )}
                  {installments.length > 0 && (
                    <Section title={t('ui.complexAboutModal.рассрочка')}>
                      <div className="flex flex-col gap-2">
                        {installments.map((t) => (
                          <LabeledLine key={t.key} label={t.label} value={t.detail} />
                        ))}
                      </div>
                    </Section>
                  )}
                  {mortgageText && (
                    <Section title={t('ui.complexAboutModal.ипотека')}>
                      <p className="text-[16px] text-[#fcecc8]">{mortgageText}</p>
                    </Section>
                  )}
                  {commissionRows.length > 0 && (
                    <Section title={t('ui.complexAboutModal.комиссия_агента')}>
                      <SpecGrid rows={commissionRows} />
                      {commissionBonus && <p className="text-[16px] text-[#d0e8df]">{commissionBonus}</p>}
                    </Section>
                  )}
                  {promos.length > 0 && (
                    <Section title={t('ui.complexAboutModal.акции_и_бонусы')}>
                      <ul className="flex flex-col gap-1.5">
                        {promos.map((promo) => (
                          <li key={promo} className="text-[16px] text-[#fcecc8]">
                            {promo}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}
                </>
              )}

              {activeId === 'invest' && (
                <>
                  {yieldRows.length > 0 && (
                    <Section title={t('ui.complexAboutModal.доходность')}>
                      <SpecGrid rows={yieldRows} />
                    </Section>
                  )}
                  {rentalText && (
                    <Section title={t('ui.complexAboutModal.арендный_потенциал')}>
                      <Paragraph text={rentalText} />
                    </Section>
                  )}
                  {investmentText && (
                    <Section title={t('ui.complexAboutModal.инвестиционный_потен')}>
                      <Paragraph text={investmentText} />
                    </Section>
                  )}
                </>
              )}

              {activeId === 'scripts' && (
                <Section title={t('ui.complexAboutModal.скрипты_продаж')}>
                  <div className="flex flex-col gap-4">
                    {scripts.map((s, idx) => (
                      <div key={idx} className="flex flex-col gap-1.5">
                        {s.question?.trim() && (
                          <p className="text-[16px] text-[#d0e8df]">{s.question.trim()}</p>
                        )}
                        {s.answer?.trim() && <Paragraph text={s.answer.trim()} />}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
