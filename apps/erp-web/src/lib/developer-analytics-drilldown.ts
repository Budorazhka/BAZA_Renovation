import type {
  DeveloperAnalyticsSnapshot,
  DeveloperFunnelStage,
} from '@/types/developer-analytics'

/**
 * Что именно кликнули в отчёте. Каждый target разворачивается в список строк —
 * расшифровку числа, на которое нажали.
 */
export type DrilldownTarget =
  | { kind: 'kpi'; metric: 'salesPlan' | 'revenue' | 'inventory' | 'bookings' }
  | { kind: 'funnelStage'; stage: DeveloperFunnelStage }
  | { kind: 'salesPoint'; date: string }
  | { kind: 'project'; projectId: string; column: 'available' | 'reserved' | 'sold' }
  | { kind: 'realtor'; realtorId: string }
  | { kind: 'marketingSource'; marketingId: string }

export type DrilldownColumnAlign = 'left' | 'right'

export interface DrilldownColumn {
  key: string
  label: string
  align?: DrilldownColumnAlign
  /** Акцент значения: gold — деньги/главное, mint — объём, danger — просрочка. */
  tone?: 'gold' | 'mint' | 'danger' | 'default'
}

export interface DrilldownRow {
  id: string
  cells: Record<string, string>
  /** Строка помечена как проблемная — просроченная бронь, отказ. */
  danger?: boolean
}

export interface DrilldownStat {
  label: string
  value: string
}

export interface DrilldownResult {
  title: string
  subtitle: string
  stats: DrilldownStat[]
  columns: DrilldownColumn[]
  rows: DrilldownRow[]
  /** Показывается вместо таблицы, когда за числом нет построчной расшифровки. */
  note?: string
}

type Language = 'ru' | 'en' | 'ka' | 'es' | 'tr'
const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  ka: 'ka-GE',
  es: 'es-ES',
  tr: 'tr-TR',
}

export interface DrilldownContext {
  analytics: DeveloperAnalyticsSnapshot
  language: Language
  /** Переводчик страницы — переиспользуем ключи отчёта. */
  t: (key: string, fallback?: string) => string
}

function money(value: number, language: Language) {
  return new Intl.NumberFormat(LOCALE_BY_LANGUAGE[language], {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function num(value: number, language: Language) {
  return value.toLocaleString(LOCALE_BY_LANGUAGE[language])
}

/**
 * Снапшот текущего разбора: справочники имён берём из реальных данных,
 * а не из моков. Ставится в начале resolveDrilldown (вызов синхронный).
 */
let currentSnapshot: DeveloperAnalyticsSnapshot | null = null

function projectName(id: string) {
  return currentSnapshot?.projects.find((project) => project.id === id)?.name ?? id
}

function managerName(id: string) {
  if (!id) return '—'
  return currentSnapshot?.managers.find((manager) => manager.id === id)?.name ?? id
}

function realtorName(id?: string) {
  if (!id) return '—'
  const realtor = currentSnapshot?.realtors.find((row) => row.id === id)
  if (!realtor) return id
  return realtor.agency ? `${realtor.name} · ${realtor.agency}` : realtor.name
}

/** Неделя, в которую попадает дата, — совпадает с бакетом графика продаж. */
function weekBucketStart(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  const dayIndex = (parsed.getUTCDay() + 6) % 7
  parsed.setUTCDate(parsed.getUTCDate() - dayIndex)
  return parsed.toISOString().slice(0, 10)
}

function salesColumns(t: DrilldownContext['t']): DrilldownColumn[] {
  return [
    { key: 'date', label: t('developerAnalytics.table.date') },
    { key: 'project', label: t('developerAnalytics.table.project') },
    { key: 'unit', label: t('developerAnalytics.table.unit') },
    { key: 'manager', label: t('developerAnalytics.table.manager') },
    { key: 'amount', label: t('developerAnalytics.table.amount'), align: 'right', tone: 'gold' },
  ]
}

function salesRows(
  sales: DeveloperAnalyticsSnapshot['sales'],
  language: Language,
): DrilldownRow[] {
  return sales.map((sale) => ({
    id: sale.id,
    cells: {
      date: sale.soldAt,
      project: projectName(sale.projectId),
      unit: sale.unit,
      manager: managerName(sale.managerId),
      amount: money(sale.amount, language),
    },
  }))
}

function bookingColumns(t: DrilldownContext['t']): DrilldownColumn[] {
  return [
    { key: 'project', label: t('developerAnalytics.table.project') },
    { key: 'unit', label: t('developerAnalytics.table.unit') },
    { key: 'client', label: t('developerAnalytics.table.client') },
    { key: 'manager', label: t('developerAnalytics.table.manager') },
    { key: 'status', label: t('developerAnalytics.table.status') },
    { key: 'expires', label: t('developerAnalytics.table.expires') },
  ]
}

function bookingRows(
  bookings: DeveloperAnalyticsSnapshot['bookings'],
  t: DrilldownContext['t'],
): DrilldownRow[] {
  return bookings.map((booking) => ({
    id: booking.id,
    danger: booking.status === 'expired' || booking.status === 'expiring',
    cells: {
      project: projectName(booking.projectId),
      unit: booking.unit,
      client: booking.client,
      manager: managerName(booking.managerId),
      status: t(`developerAnalytics.bookingStatus.${booking.status}`),
      expires: booking.expiresAt.slice(0, 16).replace('T', ' '),
    },
  }))
}

/** Расшифровка KPI-плашек. */
function resolveKpi(
  metric: Extract<DrilldownTarget, { kind: 'kpi' }>['metric'],
  ctx: DrilldownContext,
): DrilldownResult {
  const { analytics, language, t } = ctx
  const { kpi } = analytics

  if (metric === 'salesPlan' || metric === 'revenue') {
    const isPlan = metric === 'salesPlan'
    return {
      title: isPlan ? t('developerAnalytics.kpi.salesPlan') : t('developerAnalytics.kpi.revenue'),
      subtitle: t('developerAnalytics.drilldown.salesSubtitle', 'Сделки, из которых сложилось число'),
      stats: [
        { label: t('developerAnalytics.kpi.salesPlan'), value: `${kpi.salesCount} / ${kpi.salesPlan}` },
        { label: t('developerAnalytics.kpi.revenue'), value: money(kpi.revenue, language) },
        {
          label: t('developerAnalytics.realtorReport.averageCheck'),
          value: money(kpi.salesCount ? Math.round(kpi.revenue / kpi.salesCount) : 0, language),
        },
      ],
      columns: salesColumns(t),
      rows: salesRows(analytics.sales, language),
    }
  }

  if (metric === 'inventory') {
    return {
      title: t('developerAnalytics.kpi.inventory'),
      subtitle: t('developerAnalytics.drilldown.inventorySubtitle', 'Остатки по проектам'),
      stats: [
        { label: t('developerAnalytics.table.total'), value: num(kpi.totalUnits, language) },
        { label: t('developerAnalytics.table.available'), value: num(kpi.availableUnits, language) },
        { label: t('developerAnalytics.table.reserved'), value: num(kpi.reservedUnits, language) },
        { label: t('developerAnalytics.table.sold'), value: num(kpi.soldUnits, language) },
      ],
      columns: [
        { key: 'project', label: t('developerAnalytics.table.project') },
        { key: 'available', label: t('developerAnalytics.table.available'), align: 'right', tone: 'mint' },
        { key: 'reserved', label: t('developerAnalytics.table.reserved'), align: 'right' },
        { key: 'sold', label: t('developerAnalytics.table.sold'), align: 'right', tone: 'gold' },
        { key: 'averagePrice', label: t('developerAnalytics.averagePrice'), align: 'right' },
      ],
      rows: analytics.projects.map((project) => ({
        id: project.id,
        cells: {
          project: `${project.name} · ${project.city}`,
          available: num(project.availableUnits, language),
          reserved: num(project.reservedUnits, language),
          sold: num(project.soldUnits, language),
          averagePrice: money(project.averagePrice, language),
        },
      })),
    }
  }

  const activeBookings = analytics.bookings.filter(
    (booking) => booking.status === 'active' || booking.status === 'expiring',
  )
  return {
    title: t('developerAnalytics.kpi.bookings'),
    subtitle: t('developerAnalytics.drilldown.bookingsSubtitle', 'Активные брони и сроки'),
    stats: [
      { label: t('developerAnalytics.kpi.bookings'), value: num(kpi.activeBookings, language) },
      { label: t('developerAnalytics.kpi.expiring'), value: num(kpi.expiringBookings, language) },
    ],
    columns: bookingColumns(t),
    rows: bookingRows(activeBookings, t),
  }
}

/** Расшифровка этапа воронки. */
function resolveFunnelStage(stage: DeveloperFunnelStage, ctx: DrilldownContext): DrilldownResult {
  const { analytics, language, t } = ctx
  const step = analytics.funnel.find((row) => row.stage === stage)
  const title = t(`developerAnalytics.funnel.${stage}`)
  const stats: DrilldownStat[] = [
    { label: t('developerAnalytics.table.leads'), value: num(step?.count ?? 0, language) },
    {
      label: t('developerAnalytics.drilldown.conversion', 'Конверсия из предыдущего'),
      value: `${step?.conversionFromPrevious ?? 0}%`,
    },
  ]

  // Стадии «бронь» и «оплата» раскрываются в реальные строки, ранние — только
  // в разрез по проектам: поимённых лидов в источнике нет.
  if (stage === 'booking') {
    return {
      title,
      subtitle: t('developerAnalytics.drilldown.bookingsSubtitle', 'Активные брони и сроки'),
      stats,
      columns: bookingColumns(t),
      rows: bookingRows(analytics.bookings, t),
    }
  }

  if (stage === 'paid') {
    return {
      title,
      subtitle: t('developerAnalytics.drilldown.salesSubtitle', 'Сделки, из которых сложилось число'),
      stats,
      columns: salesColumns(t),
      rows: salesRows(analytics.sales, language),
    }
  }

  const totalLeads = analytics.marketing.reduce((sum, row) => sum + row.leads, 0)
  return {
    title,
    subtitle: t('developerAnalytics.drilldown.stageSubtitle', 'Разрез по источникам лидов'),
    stats,
    columns: [
      { key: 'source', label: t('developerAnalytics.table.source') },
      { key: 'project', label: t('developerAnalytics.table.project') },
      { key: 'leads', label: t('developerAnalytics.table.leads'), align: 'right', tone: 'mint' },
      { key: 'share', label: t('developerAnalytics.drilldown.share', 'Доля'), align: 'right', tone: 'gold' },
    ],
    rows: analytics.marketing.map((row) => ({
      id: row.id,
      cells: {
        source: row.source,
        project: projectName(row.projectId),
        leads: num(row.leads, language),
        share: `${totalLeads ? Math.round((row.leads / totalLeads) * 100) : 0}%`,
      },
    })),
    note: analytics.marketing.length
      ? undefined
      : t('developerAnalytics.drilldown.noRows', 'Нет строк за выбранный период'),
  }
}

/** Расшифровка точки на графике продаж — сделки этой недели/дня. */
function resolveSalesPoint(date: string, ctx: DrilldownContext): DrilldownResult {
  const { analytics, language, t } = ctx
  const isWeekly = analytics.query.period !== 'week'
  const sales = analytics.sales.filter((sale) =>
    isWeekly ? weekBucketStart(sale.soldAt) === date : sale.soldAt === date,
  )
  const revenue = sales.reduce((sum, sale) => sum + sale.amount, 0)

  return {
    title: date,
    subtitle: isWeekly
      ? t('developerAnalytics.drilldown.weekSubtitle', 'Сделки недели')
      : t('developerAnalytics.drilldown.daySubtitle', 'Сделки за день'),
    stats: [
      { label: t('developerAnalytics.sales'), value: num(sales.length, language) },
      { label: t('developerAnalytics.kpi.revenue'), value: money(revenue, language) },
    ],
    columns: salesColumns(t),
    rows: salesRows(sales, language),
  }
}

/** Расшифровка строки ЖК в таблице остатков. */
function resolveProject(
  projectId: string,
  column: Extract<DrilldownTarget, { kind: 'project' }>['column'],
  ctx: DrilldownContext,
): DrilldownResult {
  const { analytics, language, t } = ctx
  const project = analytics.projects.find((row) => row.id === projectId)
  const stats: DrilldownStat[] = project
    ? [
        { label: t('developerAnalytics.table.total'), value: num(project.totalUnits, language) },
        { label: t('developerAnalytics.table.available'), value: num(project.availableUnits, language) },
        { label: t('developerAnalytics.table.reserved'), value: num(project.reservedUnits, language) },
        { label: t('developerAnalytics.table.sold'), value: num(project.soldUnits, language) },
        { label: t('developerAnalytics.averagePrice'), value: money(project.averagePrice, language) },
      ]
    : []

  if (column === 'reserved') {
    return {
      title: projectName(projectId),
      subtitle: t('developerAnalytics.drilldown.bookingsSubtitle', 'Активные брони и сроки'),
      stats,
      columns: bookingColumns(t),
      rows: bookingRows(analytics.bookings.filter((booking) => booking.projectId === projectId), t),
    }
  }

  if (column === 'sold') {
    return {
      title: projectName(projectId),
      subtitle: t('developerAnalytics.drilldown.salesSubtitle', 'Сделки, из которых сложилось число'),
      stats,
      columns: salesColumns(t),
      rows: salesRows(analytics.sales.filter((sale) => sale.projectId === projectId), language),
    }
  }

  // Свободный остаток: поштучного реестра лотов в источнике нет — показываем
  // структуру остатка и что именно занято.
  return {
    title: projectName(projectId),
    subtitle: t('developerAnalytics.drilldown.inventorySubtitle', 'Остатки по проектам'),
    stats,
    columns: [
      { key: 'status', label: t('developerAnalytics.table.status') },
      { key: 'units', label: t('developerAnalytics.table.total'), align: 'right', tone: 'mint' },
      { key: 'share', label: t('developerAnalytics.drilldown.share', 'Доля'), align: 'right', tone: 'gold' },
    ],
    rows: project
      ? [
          { key: 'available', label: t('developerAnalytics.table.available'), value: project.availableUnits },
          { key: 'reserved', label: t('developerAnalytics.table.reserved'), value: project.reservedUnits },
          { key: 'sold', label: t('developerAnalytics.table.sold'), value: project.soldUnits },
        ].map((row) => ({
          id: row.key,
          cells: {
            status: row.label,
            units: num(row.value, language),
            share: `${project.totalUnits ? Math.round((row.value / project.totalUnits) * 100) : 0}%`,
          },
        }))
      : [],
  }
}

/** Расшифровка риэлтора — его сделки и брони. */
function resolveRealtor(realtorId: string, ctx: DrilldownContext): DrilldownResult {
  const { analytics, language, t } = ctx
  const realtor = analytics.realtors.find((row) => row.id === realtorId)
  const sales = analytics.sales.filter((sale) => sale.partnerId === realtorId)

  return {
    title: realtor ? `${realtor.name} · ${realtor.agency}` : realtorName(realtorId),
    subtitle: t('developerAnalytics.drilldown.salesSubtitle', 'Сделки, из которых сложилось число'),
    stats: realtor
      ? [
          { label: t('developerAnalytics.table.leads'), value: num(realtor.leads, language) },
          { label: t('developerAnalytics.kpi.bookings'), value: num(realtor.bookings, language) },
          { label: t('developerAnalytics.sales'), value: num(realtor.sales, language) },
          { label: t('developerAnalytics.kpi.revenue'), value: money(realtor.revenue, language) },
          { label: t('developerAnalytics.realtorReport.averageCheck'), value: money(realtor.averageCheck, language) },
        ]
      : [],
    columns: salesColumns(t),
    rows: salesRows(sales, language),
    note: sales.length ? undefined : t('developerAnalytics.drilldown.noRows', 'Нет строк за выбранный период'),
  }
}

/** Расшифровка строки маркетинга — брони, пришедшие с источника. */
function resolveMarketingSource(marketingId: string, ctx: DrilldownContext): DrilldownResult {
  const { analytics, language, t } = ctx
  const row = analytics.marketing.find((item) => item.id === marketingId)
  if (!row) {
    return {
      title: t('developerAnalytics.table.source'),
      subtitle: '',
      stats: [],
      columns: [],
      rows: [],
      note: t('developerAnalytics.drilldown.noRows', 'Нет строк за выбранный период'),
    }
  }

  const bookings = analytics.bookings.filter((booking) => booking.projectId === row.projectId)
  return {
    title: `${row.source} · ${projectName(row.projectId)}`,
    subtitle: t('developerAnalytics.drilldown.bookingsSubtitle', 'Активные брони и сроки'),
    stats: [
      { label: t('developerAnalytics.table.leads'), value: num(row.leads, language) },
      { label: t('developerAnalytics.kpi.bookings'), value: num(row.bookings, language) },
      { label: t('developerAnalytics.table.conversion'), value: `${row.conversion}%` },
      { label: 'CPL', value: money(row.costPerLead, language) },
    ],
    columns: bookingColumns(t),
    rows: bookingRows(bookings, t),
  }
}

export function resolveDrilldown(target: DrilldownTarget, ctx: DrilldownContext): DrilldownResult {
  currentSnapshot = ctx.analytics
  switch (target.kind) {
    case 'kpi':
      return resolveKpi(target.metric, ctx)
    case 'funnelStage':
      return resolveFunnelStage(target.stage, ctx)
    case 'salesPoint':
      return resolveSalesPoint(target.date, ctx)
    case 'project':
      return resolveProject(target.projectId, target.column, ctx)
    case 'realtor':
      return resolveRealtor(target.realtorId, ctx)
    case 'marketingSource':
      return resolveMarketingSource(target.marketingId, ctx)
  }
}
