import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Megaphone,
  Target,
  UserCheck,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/i18n'
import { useDeveloperAnalytics } from './useDeveloperAnalytics'
import { resolveDrilldown, type DrilldownTarget } from '@/lib/developer-analytics-drilldown'
import { DrilldownSheet } from './DrilldownSheet'
import { BOOKING_STATUS_COLORS, DATA_COLORS, funnelColor } from './palette'
import { cn } from '@/lib/utils'
import type {
  DeveloperAnalyticsPeriod,
  DeveloperAnalyticsQuery,
  DeveloperFunnelStage,
} from '@/types/developer-analytics'

type SectionId = 'overview' | 'sales' | 'inventory' | 'bookings' | 'realtors' | 'marketing'

const PERIODS: DeveloperAnalyticsPeriod[] = ['week', 'month', 'quarter', 'year']
const LEADERSHIP_SECTIONS: SectionId[] = ['overview', 'sales', 'inventory', 'bookings', 'realtors', 'marketing']
const MANAGER_SECTIONS: SectionId[] = ['overview', 'sales', 'inventory', 'bookings']
const LOCALE_BY_LANGUAGE = { ru: 'ru-RU', en: 'en-US', ka: 'ka-GE', es: 'es-ES', tr: 'tr-TR' } as const

function formatNumber(value: number, language: keyof typeof LOCALE_BY_LANGUAGE) {
  return value.toLocaleString(LOCALE_BY_LANGUAGE[language])
}

function formatMoney(value: number, language: keyof typeof LOCALE_BY_LANGUAGE) {
  return new Intl.NumberFormat(LOCALE_BY_LANGUAGE[language], {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-md bg-[var(--workspace-card-bg)] p-4',
        'shadow-[inset_0_0_0_1px_var(--workspace-card-ring)]',
        className,
      )}
    >
      {children}
    </section>
  )
}

function SectionTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="mb-4 flex min-w-0 items-center gap-3">
      {/* Пустышка уравновешивает мету справа, чтобы заголовок встал по центру панели. */}
      {meta ? <span className="invisible shrink-0 text-[16px]" aria-hidden="true">{meta}</span> : null}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-[color:var(--theme-accent-heading)]">
        {icon}
        <h2 className="truncate text-[18px] font-medium tracking-[-0.02em]">{title}</h2>
      </div>
      {meta ? <span className="shrink-0 text-[16px] text-[color:var(--workspace-text-muted)]">{meta}</span> : null}
    </div>
  )
}

function KpiCard({
  label,
  value,
  meta,
  icon,
  tone = 'money',
  percent,
  onClick,
}: {
  label: string
  value: string
  meta: string
  icon: React.ReactNode
  tone?: keyof typeof DATA_COLORS
  /** Прогресс-бар; undefined — когда показывать нечего (например, план не задан). */
  percent?: number
  onClick: () => void
}) {
  const color = DATA_COLORS[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group min-w-0 rounded-md bg-[var(--workspace-card-bg)] p-4 text-left',
        'shadow-[inset_0_0_0_1px_var(--workspace-card-ring)] transition-colors',
        'hover:bg-[var(--workspace-card-hover)] hover:shadow-[inset_0_0_0_1px_var(--workspace-card-ring-hover)]',
        'focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#e6c364]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-center gap-2 text-[color:var(--workspace-text-muted)]">
            <span className="shrink-0" style={{ color }}>{icon}</span>
            <p className="truncate text-[16px] font-medium uppercase tracking-[0.08em]">{label}</p>
          </div>
          <p className="mt-3 truncate text-center text-[28px] font-medium leading-none" style={{ color }}>{value}</p>
          {percent !== undefined && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-[#00110d]">
              <div className="h-full transition-[width]" style={{ width: `${Math.min(100, Math.max(3, percent))}%`, background: color }} />
            </div>
          )}
          <p className="mt-2 line-clamp-2 text-center text-[16px] text-[color:var(--workspace-text-muted)]">{meta}</p>
        </div>
      </div>
    </button>
  )
}

function UnitsBreakdownBar({
  total,
  sold,
  soldLabel,
  reserved,
  reservedLabel,
  available,
  availableLabel,
  language,
}: {
  total: number
  sold: number
  soldLabel: string
  reserved: number
  reservedLabel: string
  available: number
  availableLabel: string
  language: keyof typeof LOCALE_BY_LANGUAGE
}) {
  const safeTotal = total || 1
  const segments = [
    { key: 'sold', value: sold, label: soldLabel, color: DATA_COLORS.money },
    { key: 'reserved', value: reserved, label: reservedLabel, color: DATA_COLORS.booking },
    { key: 'available', value: available, label: availableLabel, color: DATA_COLORS.volume },
  ]

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm bg-[#00110d]">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className="h-full"
            style={{ width: `${Math.max(0, (segment.value / safeTotal) * 100)}%`, background: segment.color }}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[16px]">
        {segments.map((segment) => (
          <div key={segment.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 truncate text-[color:var(--workspace-text-muted)]">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: segment.color }} />
              <span className="truncate">{segment.label}</span>
            </dt>
            <dd className="mt-1 text-[color:var(--workspace-text)]">{formatNumber(segment.value, language)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function StatusDot({ danger = false }: { danger?: boolean }) {
  return <span className={cn('size-3 shrink-0 rounded-full', danger ? 'bg-[#ffb4ab]' : 'bg-[#e6c364]')} />
}

function ReportMetric({ label, value, meta, tone = 'money' }: { label: string; value: string; meta: string; tone?: keyof typeof DATA_COLORS }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--workspace-card-bg)] p-4 shadow-[inset_0_0_0_1px_var(--workspace-card-ring)]">
      <p className="text-center text-[16px] font-medium uppercase tracking-[0.08em] text-[color:var(--workspace-text-muted)]">{label}</p>
      <p className="mt-3 truncate text-center text-[30px] font-medium leading-none" style={{ color: DATA_COLORS[tone] }}>{value}</p>
      <p className="mt-3 text-center text-[16px] text-[color:var(--workspace-text-muted)]">{meta}</p>
    </div>
  )
}

export function DeveloperAnalyticsPage() {
  const { currentUser } = useAuth()
  const { t, language } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const isManager = currentUser?.role === 'manager'
  const allowedSections = isManager ? MANAGER_SECTIONS : LEADERSHIP_SECTIONS
  const rawRequestedSection = searchParams.get('section')
  const requestedSection = (rawRequestedSection === 'partners' ? 'realtors' : rawRequestedSection) as SectionId | null
  const section: SectionId = requestedSection && allowedSections.includes(requestedSection)
    ? requestedSection
    : 'overview'
  const requestedPeriod = searchParams.get('period') as DeveloperAnalyticsPeriod | null
  const period = requestedPeriod && PERIODS.includes(requestedPeriod) ? requestedPeriod : 'month'
  const projectId = searchParams.get('project') ?? 'all'
  const managerId = isManager ? currentUser?.id : undefined

  const analyticsQuery = useMemo(
    () => ({
      scope: (isManager ? 'manager' : 'leadership') as DeveloperAnalyticsQuery['scope'],
      managerId,
      period,
      projectId,
    }),
    [isManager, managerId, period, projectId],
  )
  const { analytics, loading, error, refetch } = useDeveloperAnalytics(analyticsQuery)
  const projectOptions = analytics.projects
  // Блоки без источника данных (см. docs/tracking/section-analytics.md) —
  // рисуем честное «нет данных», а не выдуманные цифры.
  const unavailable = analytics.unavailable ?? []
  const hasPlans = analytics.kpi.salesPlan > 0 || analytics.kpi.revenuePlan > 0
  const funnelTopStagesMissing = unavailable.includes('funnelTopStages')
  const marketingMissing = unavailable.includes('marketing')
  /** Без источника по верхним стадиям показываем только реальные (бронь → оплата). */
  const funnelSteps = funnelTopStagesMissing
    ? analytics.funnel.filter((step) => step.stage === 'booking' || step.stage === 'paid')
    : analytics.funnel

  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null)
  const drilldownResult = useMemo(
    () => (drilldown ? resolveDrilldown(drilldown, { analytics, language, t }) : null),
    [drilldown, analytics, language, t],
  )

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next)
  }
  const openSection = (nextSection: SectionId) => setParam('section', nextSection)

  const projectName = (id: string) => analytics.projects.find((project) => project.id === id)?.name ?? id
  const managerName = (id: string) => analytics.managers.find((manager) => manager.id === id)?.name ?? id
  const funnelLabel = (stage: DeveloperFunnelStage) => t(`developerAnalytics.funnel.${stage}`)
  const activeAttention = [
    ...analytics.bookings.filter((booking) => booking.status === 'expiring' || booking.status === 'expired').map((booking) => ({
      id: booking.id,
      title: `${projectName(booking.projectId)} · ${booking.unit}`,
      meta: booking.client,
      danger: booking.status === 'expired',
    })),
    ...analytics.tasks.filter((task) => task.overdue).map((task) => ({
      id: task.id,
      title: task.title,
      meta: managerName(task.managerId),
      danger: true,
    })),
  ]

  return (
    <div className="min-h-0 w-full max-w-full overflow-x-hidden px-4 py-4 lg:px-6">
      <div className="mx-auto w-full max-w-[1760px] space-y-4">
        <header className="rounded-md bg-[var(--workspace-card-bg)] p-4 shadow-[inset_0_0_0_1px_var(--workspace-card-ring)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[16px] font-medium uppercase tracking-[0.08em] text-[#e6c364]">{t('developerAnalytics.eyebrow')}</p>
              <h1 className="mt-1 text-[30px] font-medium tracking-[-0.02em] text-[color:var(--workspace-text)]">
                {isManager ? t('developerAnalytics.managerTitle') : t('developerAnalytics.leadershipTitle')}
              </h1>
              <p className="mt-2 max-w-4xl text-[16px] text-[color:var(--workspace-text-muted)]">
                {isManager ? t('developerAnalytics.managerDescription') : t('developerAnalytics.leadershipDescription')}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5">
                <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[color:var(--workspace-text-muted)]">{t('developerAnalytics.period')}</span>
                <select
                  value={period}
                  onChange={(event) => setParam('period', event.target.value)}
                  className="h-10 min-w-40 rounded-sm bg-[var(--workspace-row-bg)] px-3 text-[16px] text-[color:var(--workspace-text)] shadow-[inset_0_-1px_0_#1e4a2a] outline-none focus:shadow-[inset_0_-2px_0_#e6c364]"
                >
                  {PERIODS.map((item) => <option key={item} value={item}>{t(`developerAnalytics.periods.${item}`)}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[color:var(--workspace-text-muted)]">{t('developerAnalytics.project')}</span>
                <select
                  value={projectId}
                  onChange={(event) => setParam('project', event.target.value)}
                  className="h-10 min-w-48 rounded-sm bg-[var(--workspace-row-bg)] px-3 text-[16px] text-[color:var(--workspace-text)] shadow-[inset_0_-1px_0_#1e4a2a] outline-none focus:shadow-[inset_0_-2px_0_#e6c364]"
                >
                  <option value="all">{t('developerAnalytics.allProjects')}</option>
                  {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            </div>
          </div>

          <nav className="mt-4 flex min-w-0 gap-1 overflow-x-auto bg-[var(--workspace-row-bg)] p-1" aria-label={t('developerAnalytics.sectionsLabel')}>
            {allowedSections.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => openSection(item)}
                className={cn(
                  'shrink-0 rounded-sm px-3 py-2 text-[16px] font-medium transition-colors',
                  section === item
                    ? 'bg-[#e6c364] text-[#031d16]'
                    : 'text-[color:var(--workspace-text-muted)] hover:bg-[var(--workspace-card-hover)] hover:text-[color:var(--workspace-text)]',
                )}
              >
                {t(`developerAnalytics.sections.${item}`)}
              </button>
            ))}
          </nav>
        </header>

        {loading && (
          <div className="rounded-md bg-[var(--workspace-card-bg)] p-4 text-[16px] text-[color:var(--workspace-text-muted)] shadow-[inset_0_0_0_1px_var(--workspace-card-ring)]">
            {t('developerAnalytics.loading', 'Загружаем данные…')}
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[var(--workspace-card-bg)] p-4 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.4)]">
            <span className="text-[16px] text-[#ffb4ab]">{error}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-sm bg-[#e6c364] px-3 py-1.5 text-[15px] font-medium text-[#031d16]"
            >
              {t('developerAnalytics.retry', 'Повторить')}
            </button>
          </div>
        )}

        {!loading && !error && analytics.projects.length === 0 && (
          <div className="rounded-md bg-[var(--workspace-card-bg)] p-4 text-[16px] text-[color:var(--workspace-text-muted)] shadow-[inset_0_0_0_1px_var(--workspace-card-ring)]">
            {t('developerAnalytics.noProjects', 'Нет ЖК — аналитика появится после создания объекта и добавления лотов.')}
          </div>
        )}

        {section === 'overview' ? (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <KpiCard
                label={t('developerAnalytics.kpi.salesPlan')}
                // План продаж пока нигде не хранится — показываем факт без плана.
                value={hasPlans ? `${analytics.kpi.salesCount} / ${analytics.kpi.salesPlan}` : formatNumber(analytics.kpi.salesCount, language)}
                meta={hasPlans ? `${analytics.kpi.planPercent}% · ${t('developerAnalytics.kpi.planComplete')}` : t('developerAnalytics.planNotSet', 'План не задан')}
                icon={<Target className="size-5" />}
                percent={hasPlans ? analytics.kpi.planPercent : undefined}
                onClick={() => setDrilldown({ kind: 'kpi', metric: 'salesPlan' })}
              />
              <KpiCard
                label={t('developerAnalytics.kpi.revenue')}
                value={formatMoney(analytics.kpi.revenue, language)}
                meta={hasPlans ? `${analytics.kpi.revenuePlanPercent}% · ${t('developerAnalytics.kpi.revenuePlan')}` : t('developerAnalytics.planNotSet', 'План не задан')}
                icon={<CircleDollarSign className="size-5" />}
                tone="paid"
                percent={hasPlans ? analytics.kpi.revenuePlanPercent : undefined}
                onClick={() => setDrilldown({ kind: 'kpi', metric: 'revenue' })}
              />
              <KpiCard
                label={t('developerAnalytics.kpi.inventory')}
                value={formatNumber(analytics.kpi.availableUnits, language)}
                meta={`${formatNumber(analytics.kpi.reservedUnits, language)} · ${t('developerAnalytics.kpi.reserved')}`}
                icon={<Building2 className="size-5" />}
                tone="volume"
                percent={pct(analytics.kpi.availableUnits, analytics.kpi.totalUnits)}
                onClick={() => setDrilldown({ kind: 'kpi', metric: 'inventory' })}
              />
              <KpiCard
                label={t('developerAnalytics.kpi.bookings')}
                value={formatNumber(analytics.kpi.activeBookings, language)}
                meta={`${analytics.kpi.expiringBookings} · ${t('developerAnalytics.kpi.expiring')}`}
                icon={<CalendarClock className="size-5" />}
                tone={analytics.kpi.expiringBookings > 0 ? 'danger' : 'booking'}
                percent={pct(analytics.kpi.expiringBookings, analytics.kpi.activeBookings || 1) || 8}
                onClick={() => setDrilldown({ kind: 'kpi', metric: 'bookings' })}
              />
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Panel>
                <SectionTitle icon={<BarChart3 className="size-5" />} title={t('developerAnalytics.salesDynamics')} meta={t(`developerAnalytics.periods.${period}`)} />
                <div className="h-[320px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={analytics.salesSeries}
                      margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
                      onClick={(state) => {
                        const date = state?.activeLabel
                        if (typeof date === 'string') setDrilldown({ kind: 'salesPoint', date })
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <defs>
                        <linearGradient id="developerSalesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={DATA_COLORS.paid} stopOpacity={0.34} />
                          <stop offset="95%" stopColor={DATA_COLORS.paid} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="developerRevenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={DATA_COLORS.money} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={DATA_COLORS.money} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(30,74,42,0.45)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#d0e8df', fontSize: 16 }} />
                      <YAxis yAxisId="sales" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: DATA_COLORS.paid, fontSize: 16 }} width={32} />
                      <YAxis
                        yAxisId="revenue"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: DATA_COLORS.money, fontSize: 16 }}
                        width={64}
                        tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{ background: '#112d1c', border: 'none', borderRadius: 6, boxShadow: 'inset 0 0 0 1px rgba(230,195,100,.35)', color: '#fff', fontFamily: 'Montserrat' }}
                        labelStyle={{ color: '#d0e8df', fontSize: 16 }}
                        itemStyle={{ fontSize: 16 }}
                        formatter={(value, name) =>
                          name === t('developerAnalytics.kpi.revenue') && typeof value === 'number'
                            ? formatMoney(value, language)
                            : String(value ?? '')
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 16, paddingTop: 8 }} iconType="square" />
                      <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke={DATA_COLORS.money} strokeWidth={2} fill="url(#developerRevenueFill)" name={t('developerAnalytics.kpi.revenue')} />
                      <Area yAxisId="sales" type="monotone" dataKey="sales" stroke={DATA_COLORS.paid} strokeWidth={3} fill="url(#developerSalesFill)" name={t('developerAnalytics.sales')} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel>
                <SectionTitle icon={<Target className="size-5" />} title={t('developerAnalytics.funnelTitle')} meta={`${analytics.funnel[analytics.funnel.length - 1]?.count ?? 0} ${t('developerAnalytics.paid')}`} />
                <div className="space-y-3">
                  {funnelSteps.map((step, index) => {
                    const max = funnelSteps[0]?.count || 1
                    return (
                      <button
                        key={step.stage}
                        type="button"
                        onClick={() => setDrilldown({ kind: 'funnelStage', stage: step.stage })}
                        className="block w-full rounded-sm bg-[var(--workspace-row-bg)] p-3 text-left transition-colors hover:bg-[var(--workspace-card-hover)]"
                      >
                        <div className="flex items-center justify-between gap-3 text-[16px]">
                          <span className="flex min-w-0 items-center gap-2 text-[color:var(--workspace-text)]">
                            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: funnelColor(step.stage) }} />
                            <span className="truncate">{funnelLabel(step.stage)}</span>
                          </span>
                          <span style={{ color: funnelColor(step.stage) }}>{formatNumber(step.count, language)} · {step.conversionFromPrevious}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[#00110d]">
                          <div className="h-full" style={{ width: `${Math.max(4, pct(step.count, max))}%`, background: funnelColor(step.stage) }} />
                        </div>
                        {index < funnelSteps.length - 1 ? <span className="sr-only">{t('developerAnalytics.nextStage')}</span> : null}
                      </button>
                    )
                  })}
                  {funnelTopStagesMissing && (
                    <p className="text-[15px] text-[color:var(--workspace-text-muted)]">
                      {t('developerAnalytics.funnelTopStagesMissing', 'Стадии до брони (лиды, квалификация, показы) пока не собираются — показаны брони и оплаты.')}
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <Panel>
                <SectionTitle icon={<Building2 className="size-5" />} title={t('developerAnalytics.inventoryByProject')} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-[16px]">
                    <thead className="bg-[#163824] text-left uppercase tracking-[0.08em] text-[#e6c364]">
                      <tr>
                        <th className="px-3 py-3 font-medium">{t('developerAnalytics.table.project')}</th>
                        <th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.available')}</th>
                        <th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.reserved')}</th>
                        <th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.sold')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.projects.map((project, index) => (
                        <tr
                          key={project.id}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-[var(--workspace-card-hover)]',
                            index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]',
                          )}
                          onClick={() => setDrilldown({ kind: 'project', projectId: project.id, column: 'available' })}
                        >
                          <td className="px-3 py-3 text-[color:var(--workspace-text)]">{project.name}<span className="ml-2 text-[color:var(--workspace-text-muted)]">{project.city}</span></td>
                          <td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.volume }}>{formatNumber(project.availableUnits, language)}</td>
                          <td
                            className="px-3 py-3 text-right"
                            style={{ color: DATA_COLORS.booking }}
                            onClick={(event) => { event.stopPropagation(); setDrilldown({ kind: 'project', projectId: project.id, column: 'reserved' }) }}
                          >
                            {formatNumber(project.reservedUnits, language)}
                          </td>
                          <td
                            className="px-3 py-3 text-right"
                            style={{ color: DATA_COLORS.money }}
                            onClick={(event) => { event.stopPropagation(); setDrilldown({ kind: 'project', projectId: project.id, column: 'sold' }) }}
                          >
                            {formatNumber(project.soldUnits, language)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel>
                <SectionTitle icon={<AlertTriangle className="size-5" />} title={t('developerAnalytics.attentionTitle')} meta={String(activeAttention.length)} />
                <div className="space-y-2">
                  {activeAttention.length ? activeAttention.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id.startsWith('booking') ? 'bookings' : 'sales')}
                      className="flex w-full min-w-0 items-center gap-3 rounded-sm bg-[var(--workspace-row-bg)] px-3 py-3 text-left hover:bg-[var(--workspace-card-hover)]"
                    >
                      <StatusDot danger={item.danger} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] text-[color:var(--workspace-text)]">{item.title}</span>
                        <span className="block truncate text-[16px] text-[color:var(--workspace-text-muted)]">{item.meta}</span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-[#e6c364]" />
                    </button>
                  )) : (
                    <p className="rounded-sm bg-[var(--workspace-row-bg)] p-4 text-[16px] text-[color:var(--workspace-text-muted)]">{t('developerAnalytics.noAttention')}</p>
                  )}
                </div>
              </Panel>
            </div>
          </>
        ) : null}

        {section === 'sales' ? (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Panel>
              <SectionTitle icon={<Target className="size-5" />} title={t('developerAnalytics.funnelTitle')} />
              <div className="space-y-3">
                {analytics.funnel.map((step) => (
                  <button
                    key={step.stage}
                    type="button"
                    onClick={() => setDrilldown({ kind: 'funnelStage', stage: step.stage })}
                    className="block w-full rounded-sm bg-[var(--workspace-row-bg)] p-3 text-left transition-colors hover:bg-[var(--workspace-card-hover)]"
                  >
                    <div className="flex justify-between gap-3 text-[16px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: funnelColor(step.stage) }} />
                        <span className="truncate">{funnelLabel(step.stage)}</span>
                      </span>
                      <span style={{ color: funnelColor(step.stage) }}>{step.count} · {step.conversionFromPrevious}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
            <Panel>
              <SectionTitle icon={<CircleDollarSign className="size-5" />} title={t('developerAnalytics.salesRegister')} meta={formatMoney(analytics.kpi.revenue, language)} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[16px]">
                  <thead className="bg-[#163824] uppercase tracking-[0.08em] text-[#e6c364]"><tr><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.date')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.project')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.unit')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.manager')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.amount')}</th></tr></thead>
                  <tbody>{analytics.sales.map((sale, index) => <tr key={sale.id} className={index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]'}><td className="px-3 py-3">{sale.soldAt}</td><td className="px-3 py-3">{projectName(sale.projectId)}</td><td className="px-3 py-3">{sale.unit}</td><td className="px-3 py-3">{managerName(sale.managerId)}</td><td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.money }}>{formatMoney(sale.amount, language)}</td></tr>)}</tbody>
                </table>
              </div>
            </Panel>
          </div>
        ) : null}

        {section === 'inventory' ? (
          <div className="grid min-w-0 gap-4 xl:grid-cols-3">
            {analytics.projects.map((project) => (
              <Panel key={project.id}>
                <SectionTitle
                  icon={<Building2 className="size-5" />}
                  title={project.name}
                  meta={`${formatNumber(project.totalUnits, language)} · ${t('developerAnalytics.table.total')}`}
                />
                <UnitsBreakdownBar
                  total={project.totalUnits}
                  sold={project.soldUnits}
                  soldLabel={t('developerAnalytics.table.sold')}
                  reserved={project.reservedUnits}
                  reservedLabel={t('developerAnalytics.table.reserved')}
                  available={project.availableUnits}
                  availableLabel={t('developerAnalytics.table.available')}
                  language={language}
                />
                <div className="mt-3 rounded-sm bg-[var(--workspace-row-bg)] p-3 text-[16px]"><span className="text-[color:var(--workspace-text-muted)]">{t('developerAnalytics.averagePrice')}</span><span className="float-right" style={{ color: DATA_COLORS.money }}>{formatMoney(project.averagePrice, language)}</span></div>
              </Panel>
            ))}
          </div>
        ) : null}

        {section === 'bookings' ? (
          <Panel>
            <SectionTitle icon={<CalendarClock className="size-5" />} title={t('developerAnalytics.bookingsRegister')} meta={String(analytics.bookings.length)} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[16px]">
                <thead className="bg-[#163824] uppercase tracking-[0.08em] text-[#e6c364]"><tr><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.project')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.unit')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.client')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.manager')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.status')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.expires')}</th></tr></thead>
                <tbody>{analytics.bookings.map((booking, index) => <tr key={booking.id} className={index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]'}><td className="px-3 py-3">{projectName(booking.projectId)}</td><td className="px-3 py-3">{booking.unit}</td><td className="px-3 py-3">{booking.client}</td><td className="px-3 py-3">{managerName(booking.managerId)}</td><td className="px-3 py-3" style={{ color: BOOKING_STATUS_COLORS[booking.status] ?? DATA_COLORS.volume }}>{t(`developerAnalytics.bookingStatus.${booking.status}`)}</td><td className="px-3 py-3">{booking.expiresAt.slice(0, 16).replace('T', ' ')}</td></tr>)}</tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {section === 'realtors' && !isManager ? (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-5">
              <ReportMetric
                label={t('developerAnalytics.realtorReport.activeRealtors')}
                value={formatNumber(analytics.realtorSummary.activeRealtors, language)}
                meta={`${analytics.realtorSummary.bookings} · ${t('developerAnalytics.realtorReport.bookingsInWork')}`}
                tone="showing"
              />
              <ReportMetric
                label={t('developerAnalytics.realtorReport.leads')}
                value={formatNumber(analytics.realtorSummary.leads, language)}
                meta={`${analytics.realtorSalesFunnel[1]?.conversionFromPrevious ?? 0}% · ${t('developerAnalytics.realtorReport.qualifiedShare')}`}
                tone="volume"
              />
              <ReportMetric
                label={t('developerAnalytics.realtorReport.reservedClients')}
                value={formatNumber(analytics.realtorSummary.reservedClients, language)}
                meta={t('developerAnalytics.realtorReport.reservedClientsMeta')}
                tone="booking"
              />
              <ReportMetric
                label={t('developerAnalytics.realtorReport.channelSales')}
                value={formatNumber(analytics.realtorSummary.sales, language)}
                meta={`${analytics.realtorSummary.salesShare}% · ${t('developerAnalytics.realtorReport.salesShare')}`}
                tone="paid"
              />
              <ReportMetric
                label={t('developerAnalytics.realtorReport.channelRevenue')}
                value={formatMoney(analytics.realtorSummary.revenue, language)}
                meta={`${analytics.realtorSummary.revenueShare}% · ${t('developerAnalytics.realtorReport.revenueShare')}`}
                tone="money"
              />
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Panel>
                <SectionTitle
                  icon={<Target className="size-5" />}
                  title={t('developerAnalytics.realtorReport.crmSalesFunnel')}
                  meta={t('developerAnalytics.realtorReport.salesOnly')}
                />
                <div className="space-y-3">
                  {analytics.realtorSalesFunnel.map((step) => {
                    const max = analytics.realtorSalesFunnel[0]?.count || 1
                    return (
                      <div key={step.stage} className="rounded-sm bg-[var(--workspace-row-bg)] p-3">
                        <div className="flex items-center justify-between gap-3 text-[16px]">
                          <span className="flex min-w-0 items-center gap-2 text-[color:var(--workspace-text)]">
                            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: funnelColor(step.stage) }} />
                            <span className="truncate">{funnelLabel(step.stage)}</span>
                          </span>
                          <span style={{ color: funnelColor(step.stage) }}>{formatNumber(step.count, language)} · {step.conversionFromPrevious}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[#00110d]">
                          <div className="h-full" style={{ width: `${Math.max(4, pct(step.count, max))}%`, background: funnelColor(step.stage) }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>

              <Panel>
                <SectionTitle
                  icon={<CircleDollarSign className="size-5" />}
                  title={t('developerAnalytics.realtorReport.channelEconomics')}
                  meta={formatMoney(analytics.realtorSummary.averageCheck, language)}
                />
                <div className="space-y-3">
                  {[
                    { label: t('developerAnalytics.realtorReport.salesConversion'), value: pct(analytics.realtorSummary.sales, analytics.realtorSummary.leads), color: DATA_COLORS.paid },
                    { label: t('developerAnalytics.realtorReport.bookingConversion'), value: pct(analytics.realtorSummary.bookings, analytics.realtorSummary.leads), color: DATA_COLORS.booking },
                    { label: t('developerAnalytics.realtorReport.salesShare'), value: analytics.realtorSummary.salesShare, color: DATA_COLORS.money },
                  ].map((row) => (
                    <div key={row.label} className="rounded-sm bg-[var(--workspace-row-bg)] p-3">
                      <div className="flex items-center justify-between gap-3 text-[16px]">
                        <span className="text-[color:var(--workspace-text)]">{row.label}</span>
                        <span style={{ color: row.color }}>{row.value}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[#00110d]">
                        <div className="h-full" style={{ width: `${Math.max(4, Math.min(100, row.value))}%`, background: row.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel>
              <SectionTitle icon={<Users className="size-5" />} title={t('developerAnalytics.realtorPerformance')} meta={String(analytics.realtors.length)} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-[16px]">
                  <thead className="bg-[#163824] uppercase tracking-[0.08em] text-[#e6c364]"><tr><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.realtorReport.realtor')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.realtorReport.projects')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.leads')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.kpi.bookings')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.realtorReport.reservedClients')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.sales')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.realtorReport.salesConversion')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.realtorReport.averageCheck')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.kpi.revenue')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.realtorReport.salesShare')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.realtorReport.lastSale')}</th></tr></thead>
                  <tbody>
                    {analytics.realtors.map((realtor, index) => (
                      <tr
                        key={realtor.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-[var(--workspace-card-hover)]',
                          index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]',
                        )}
                        onClick={() => setDrilldown({ kind: 'realtor', realtorId: realtor.id })}
                      >
                        <td className="px-3 py-3"><span className="block text-[color:var(--workspace-text)]">{realtor.name}</span><span className="block text-[16px] text-[color:var(--workspace-text-muted)]">{realtor.agency}</span></td>
                        <td className="max-w-72 px-3 py-3 text-[color:var(--workspace-text-muted)]">{realtor.projectIds.map(projectName).join(', ')}</td>
                        <td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.volume }}>{formatNumber(realtor.leads, language)}</td>
                        <td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.booking }}>{realtor.bookings}</td>
                        <td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.booking }}>{realtor.reservedClients}</td>
                        <td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.paid }}>{realtor.sales}</td>
                        <td className="px-3 py-3 text-right">{realtor.salesConversion}%</td>
                        <td className="px-3 py-3 text-right">{formatMoney(realtor.averageCheck, language)}</td>
                        <td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.money }}>{formatMoney(realtor.revenue, language)}</td>
                        <td className="px-3 py-3 text-right">{realtor.salesShare}%</td>
                        <td className="px-3 py-3 text-[color:var(--workspace-text-muted)]">{realtor.lastSaleAt ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analytics.realtors.length === 0 ? <p className="bg-[var(--workspace-row-bg)] p-4 text-[16px] text-[color:var(--workspace-text-muted)]">{t('developerAnalytics.realtorReport.noData')}</p> : null}
              </div>
            </Panel>

            <Panel>
              <SectionTitle icon={<UserCheck className="size-5" />} title={t('developerAnalytics.realtorReport.reservationsRegister')} meta={String(analytics.reservations.length)} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-[16px]">
                  <thead className="bg-[#163824] uppercase tracking-[0.08em] text-[#e6c364]"><tr><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.project')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.client')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.realtorReport.realtor')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.date')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.realtorReport.reservedUntil')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.status')}</th></tr></thead>
                  <tbody>
                    {analytics.reservations.map((reservation, index) => {
                      const isExpired = reservation.reservedUntil < new Date().toISOString()
                      const realtor = analytics.realtors.find((row) => row.id === reservation.realtorId)
                      return (
                        <tr key={reservation.id} className={index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]'}>
                          <td className="px-3 py-3">{projectName(reservation.projectId)}</td>
                          <td className="px-3 py-3">{reservation.clientName}</td>
                          <td className="px-3 py-3">{realtor?.name ?? '—'}</td>
                          <td className="px-3 py-3">{reservation.createdAt}</td>
                          <td className="px-3 py-3">{reservation.reservedUntil}</td>
                          <td className="px-3 py-3" style={{ color: isExpired ? DATA_COLORS.danger : DATA_COLORS.paid }}>
                            {isExpired ? t('developerAnalytics.realtorReport.reservationExpired') : t('developerAnalytics.realtorReport.reservationActive')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {analytics.reservations.length === 0 ? <p className="bg-[var(--workspace-row-bg)] p-4 text-[16px] text-[color:var(--workspace-text-muted)]">{t('developerAnalytics.realtorReport.noReservations')}</p> : null}
              </div>
            </Panel>
          </>
        ) : null}

        {section === 'marketing' && !isManager && marketingMissing ? (
          <Panel>
            <SectionTitle icon={<Megaphone className="size-5" />} title={t('developerAnalytics.marketingPerformance')} />
            <p className="text-[16px] text-[color:var(--workspace-text-muted)]">
              {t('developerAnalytics.marketingMissing', 'Источники лидов и расходы на рекламу пока не собираются — блок появится после подключения UTM-меток и бюджета кампаний.')}
            </p>
          </Panel>
        ) : null}

        {section === 'marketing' && !isManager && !marketingMissing ? (
          <Panel>
            <SectionTitle icon={<Megaphone className="size-5" />} title={t('developerAnalytics.marketingPerformance')} />
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[16px]"><thead className="bg-[#163824] uppercase tracking-[0.08em] text-[#e6c364]"><tr><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.source')}</th><th className="px-3 py-3 text-left font-medium">{t('developerAnalytics.table.project')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.leads')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.kpi.bookings')}</th><th className="px-3 py-3 text-right font-medium">{t('developerAnalytics.table.conversion')}</th><th className="px-3 py-3 text-right font-medium">CPL</th></tr></thead><tbody>{analytics.marketing.map((row, index) => <tr key={row.id} className={cn('cursor-pointer transition-colors hover:bg-[var(--workspace-card-hover)]', index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]')} onClick={() => setDrilldown({ kind: 'marketingSource', marketingId: row.id })}><td className="px-3 py-3">{row.source}</td><td className="px-3 py-3">{projectName(row.projectId)}</td><td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.volume }}>{row.leads}</td><td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.booking }}>{row.bookings}</td><td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.paid }}>{row.conversion}%</td><td className="px-3 py-3 text-right" style={{ color: DATA_COLORS.money }}>{formatMoney(row.costPerLead, language)}</td></tr>)}</tbody></table></div>
          </Panel>
        ) : null}
      </div>

      <DrilldownSheet
        result={drilldownResult}
        onClose={() => setDrilldown(null)}
        closeLabel={t('developerAnalytics.drilldown.close', 'Закрыть')}
        emptyLabel={t('developerAnalytics.drilldown.noRows', 'Нет строк за выбранный период')}
        rowsLabel={t('developerAnalytics.drilldown.rows', 'Строк')}
      />
    </div>
  )
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

export default DeveloperAnalyticsPage
