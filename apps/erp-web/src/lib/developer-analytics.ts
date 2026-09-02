import type {
  DeveloperAnalyticsPeriod,
  DeveloperAnalyticsQuery,
  DeveloperAnalyticsSnapshot,
  DeveloperBookingMetric,
  DeveloperFunnelMetric,
  DeveloperFunnelStage,
  DeveloperManagerMetric,
  DeveloperMarketingMetric,
  DeveloperProjectMetric,
  DeveloperRealtorActivityMetric,
  DeveloperRealtorMetric,
  DeveloperReservationMetric,
  DeveloperSaleMetric,
  DeveloperTaskMetric,
} from '@/types/developer-analytics'

/**
 * Сборка снапшота аналитики девелопера из «сырых» метрик API
 * (`GET /api/development/analytics/summary`).
 *
 * Считаем только то, для чего есть данные в БД. Блоки без источника
 * (планы менеджеров, задачи, верхние стадии воронки, маркетинг, лиды риэлторов)
 * возвращаются пустыми и перечислены в `unavailable` — страница показывает
 * честное «нет данных» вместо выдуманных цифр.
 * План: docs/tracking/section-analytics.md
 */

export interface DeveloperAnalyticsSummaryResponse {
  projects: DeveloperProjectMetric[]
  bookings: DeveloperBookingMetric[]
  reservations: DeveloperReservationMetric[]
  sales: DeveloperSaleMetric[]
  realtors: DeveloperRealtorMetric[]
  managers: DeveloperManagerMetric[]
  tasks: DeveloperTaskMetric[]
  funnel: DeveloperFunnelMetric[]
  realtorActivity: DeveloperRealtorActivityMetric[]
  marketing: DeveloperMarketingMetric[]
  unavailable: string[]
  generatedAt: string
}

const FUNNEL_STAGES: DeveloperFunnelStage[] = ['new', 'qualified', 'showing', 'booking', 'paid']

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

/** Начало периода относительно текущей даты (ISO yyyy-mm-dd). */
export function developerPeriodRange(period: DeveloperAnalyticsPeriod): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString()
  const start = new Date(now)
  if (period === 'week') start.setDate(now.getDate() - 6)
  else if (period === 'month') start.setMonth(now.getMonth() - 1)
  else if (period === 'quarter') start.setMonth(now.getMonth() - 3)
  else start.setFullYear(now.getFullYear() - 1)
  start.setHours(0, 0, 0, 0)
  return { from: start.toISOString(), to }
}

function weekBucketStart(dateIso: string): string {
  const parsed = new Date(dateIso)
  if (Number.isNaN(parsed.getTime())) return dateIso.slice(0, 10)
  const dayIndex = (parsed.getUTCDay() + 6) % 7
  parsed.setUTCDate(parsed.getUTCDate() - dayIndex)
  return parsed.toISOString().slice(0, 10)
}

export function buildDeveloperAnalytics(
  summary: DeveloperAnalyticsSummaryResponse,
  query: DeveloperAnalyticsQuery,
): DeveloperAnalyticsSnapshot & { unavailable: string[] } {
  const projects = summary.projects.filter(
    (project) => !query.projectId || query.projectId === 'all' || project.id === query.projectId,
  )
  const projectIds = new Set(projects.map((project) => project.id))

  // Менеджеры: в scope=manager оставляем только своего.
  const managers = summary.managers.filter(
    (manager) => query.scope !== 'manager' || !query.managerId || manager.id === query.managerId,
  )
  const managerIds = new Set(managers.map((manager) => manager.id))
  const inManagerScope = (managerId: string) =>
    query.scope !== 'manager' || !managerId || managerIds.has(managerId)

  const bookings = summary.bookings.filter(
    (booking) => projectIds.has(booking.projectId) && inManagerScope(booking.managerId),
  )
  const sales = summary.sales.filter(
    (sale) => projectIds.has(sale.projectId) && inManagerScope(sale.managerId),
  )
  const reservations = summary.reservations.filter((row) => projectIds.has(row.projectId))
  const tasks = summary.tasks.filter(
    (task) => projectIds.has(task.projectId) && inManagerScope(task.managerId),
  )

  // Воронка: верхние стадии из CRM-лидов, нижние — фактические брони/оплаты.
  // Лиды команды без `complexId` (ещё не привязаны к ЖК) считаем только в режиме
  // «все объекты» — при фильтре по конкретному ЖК приписать их некуда.
  const allProjectsMode = !query.projectId || query.projectId === 'all'
  const funnelRows = summary.funnel.filter(
    (row) =>
      (projectIds.has(row.projectId) || (allProjectsMode && row.projectId === '')) &&
      inManagerScope(row.managerId),
  )
  const leadStageCount = (stage: DeveloperFunnelStage) =>
    funnelRows.filter((row) => row.stage === stage).reduce((sum, row) => sum + row.count, 0)

  const funnelCounts: Record<DeveloperFunnelStage, number> = {
    new: leadStageCount('new'),
    qualified: leadStageCount('qualified'),
    showing: leadStageCount('showing'),
    booking: bookings.length,
    paid: sales.length,
  }
  const funnel = FUNNEL_STAGES.map((stage, index) => {
    const count = funnelCounts[stage]
    const previous = index === 0 ? count : funnelCounts[FUNNEL_STAGES[index - 1]]
    return { stage, count, conversionFromPrevious: index === 0 ? 100 : pct(count, previous) }
  })

  const nowIso = new Date().toISOString()
  const isReservationActive = (row: DeveloperReservationMetric) => row.reservedUntil >= nowIso

  const realtorActivity = summary.realtorActivity.filter((row) => projectIds.has(row.projectId))

  const realtors = summary.realtors
    .map((realtor) => {
      const activity = realtorActivity.filter((row) => row.realtorId === realtor.id)
      const realtorBookings = bookings.filter((booking) => booking.partnerId === realtor.id)
      const realtorSales = sales.filter((sale) => sale.partnerId === realtor.id)
      const realtorReservations = reservations.filter(
        (row) => row.realtorId === realtor.id && isReservationActive(row),
      )
      const revenue = realtorSales.reduce((sum, sale) => sum + sale.amount, 0)
      const saleDates = realtorSales.map((sale) => sale.soldAt).sort()
      const leads = activity.reduce((sum, row) => sum + row.leads, 0)
      return {
        ...realtor,
        projectIds: [
          ...new Set([
            ...activity.map((row) => row.projectId),
            ...realtorBookings.map((booking) => booking.projectId),
            ...realtorSales.map((sale) => sale.projectId),
            ...realtorReservations.map((row) => row.projectId),
          ]),
        ],
        leads,
        qualified: activity.reduce((sum, row) => sum + row.qualified, 0),
        showings: activity.reduce((sum, row) => sum + row.showings, 0),
        bookings: realtorBookings.length,
        sales: realtorSales.length,
        revenue,
        averageCheck: realtorSales.length ? Math.round(revenue / realtorSales.length) : 0,
        bookingConversion: pct(realtorBookings.length, leads),
        salesConversion: leads > 0 ? pct(realtorSales.length, leads) : pct(realtorSales.length, realtorBookings.length),
        salesShare: pct(realtorSales.length, sales.length),
        lastSaleAt: saleDates.length ? saleDates[saleDates.length - 1] : null,
        reservedClients: realtorReservations.length,
      }
    })
    .filter((realtor) => realtor.leads > 0 || realtor.bookings > 0 || realtor.sales > 0 || realtor.reservedClients > 0)
    .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || b.bookings - a.bookings)

  const realtorBookingsTotal = realtors.reduce((sum, realtor) => sum + realtor.bookings, 0)
  const realtorSalesTotal = realtors.reduce((sum, realtor) => sum + realtor.sales, 0)
  const realtorRevenue = realtors.reduce((sum, realtor) => sum + realtor.revenue, 0)
  const realtorReservedClients = realtors.reduce((sum, realtor) => sum + realtor.reservedClients, 0)

  const realtorSalesFunnel = [
    { stage: 'new' as const, count: realtors.reduce((sum, realtor) => sum + realtor.leads, 0) },
    { stage: 'qualified' as const, count: realtors.reduce((sum, realtor) => sum + realtor.qualified, 0) },
    { stage: 'showing' as const, count: realtors.reduce((sum, realtor) => sum + realtor.showings, 0) },
    { stage: 'booking' as const, count: realtorBookingsTotal },
    { stage: 'paid' as const, count: realtorSalesTotal },
  ].map((step, index, steps) => ({
    ...step,
    conversionFromPrevious: index === 0 ? 100 : pct(step.count, steps[index - 1].count),
  }))

  const seriesBucket = query.period === 'week'
    ? (date: string) => date.slice(0, 10)
    : weekBucketStart
  const seriesMap = new Map<string, { sales: number; revenue: number }>()
  for (const sale of sales) {
    if (!sale.soldAt) continue
    const bucket = seriesBucket(sale.soldAt)
    const current = seriesMap.get(bucket) ?? { sales: 0, revenue: 0 }
    current.sales += 1
    current.revenue += sale.amount
    seriesMap.set(bucket, current)
  }
  const salesSeries = [...seriesMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, ...value }))

  const revenue = sales.reduce((sum, sale) => sum + sale.amount, 0)

  const marketing = summary.marketing
    .filter((row) => projectIds.has(row.projectId))
    .map((row) => ({
      ...row,
      conversion: pct(row.bookings, row.leads),
      costPerLead: row.leads > 0 ? Math.round(row.spend / row.leads) : 0,
    }))

  const salesPlan = managers.reduce((sum, manager) => sum + manager.salesPlan, 0)
  const revenuePlan = managers.reduce((sum, manager) => sum + manager.revenuePlan, 0)

  return {
    query,
    projects,
    managers,
    bookings,
    sales,
    tasks,
    funnel,
    realtorSalesFunnel,
    realtors,
    realtorSummary: {
      activeRealtors: realtors.length,
      leads: 0,
      bookings: realtorBookingsTotal,
      sales: realtorSalesTotal,
      revenue: realtorRevenue,
      averageCheck: realtorSalesTotal ? Math.round(realtorRevenue / realtorSalesTotal) : 0,
      salesShare: pct(realtorSalesTotal, sales.length),
      revenueShare: pct(realtorRevenue, revenue),
      reservedClients: realtorReservedClients,
    },
    reservations,
    marketing,
    salesSeries,
    kpi: {
      totalUnits: projects.reduce((sum, project) => sum + project.totalUnits, 0),
      availableUnits: projects.reduce((sum, project) => sum + project.availableUnits, 0),
      reservedUnits: projects.reduce((sum, project) => sum + project.reservedUnits, 0),
      soldUnits: projects.reduce((sum, project) => sum + project.soldUnits, 0),
      activeBookings: bookings.filter((b) => b.status === 'active' || b.status === 'expiring').length,
      expiringBookings: bookings.filter((b) => b.status === 'expiring').length,
      salesCount: sales.length,
      salesPlan,
      revenue,
      revenuePlan,
      planPercent: pct(sales.length, salesPlan),
      revenuePlanPercent: pct(revenue, revenuePlan),
    },
    unavailable: summary.unavailable ?? [],
  }
}

export const EMPTY_DEVELOPER_SUMMARY: DeveloperAnalyticsSummaryResponse = {
  projects: [],
  bookings: [],
  reservations: [],
  sales: [],
  realtors: [],
  managers: [],
  tasks: [],
  funnel: [],
  realtorActivity: [],
  marketing: [],
  unavailable: [],
  generatedAt: '',
}
