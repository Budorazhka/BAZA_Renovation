export type DeveloperAnalyticsScope = 'leadership' | 'manager'
export type DeveloperAnalyticsPeriod = 'week' | 'month' | 'quarter' | 'year'
export type DeveloperBookingStatus = 'active' | 'expiring' | 'expired' | 'paid'
export type DeveloperFunnelStage = 'new' | 'qualified' | 'showing' | 'booking' | 'paid'

export interface DeveloperProjectMetric {
  id: string
  name: string
  city: string
  currency: 'USD'
  totalUnits: number
  availableUnits: number
  reservedUnits: number
  soldUnits: number
  averagePrice: number
  completionDate: string
}

export interface DeveloperManagerMetric {
  id: string
  name: string
  projectIds: string[]
  salesPlan: number
  revenuePlan: number
}

export interface DeveloperBookingMetric {
  id: string
  projectId: string
  unit: string
  client: string
  managerId: string
  partnerId?: string
  status: DeveloperBookingStatus
  createdAt: string
  expiresAt: string
  amount: number
}

export interface DeveloperSaleMetric {
  id: string
  projectId: string
  unit: string
  managerId: string
  partnerId?: string
  soldAt: string
  amount: number
}

export interface DeveloperTaskMetric {
  id: string
  managerId: string
  projectId: string
  title: string
  dueAt: string
  overdue: boolean
}

export interface DeveloperFunnelMetric {
  projectId: string
  managerId: string
  stage: DeveloperFunnelStage
  count: number
}

export interface DeveloperRealtorMetric {
  id: string
  name: string
  agency: string
}

export type DeveloperReservationStatus = 'active' | 'expired'

export interface DeveloperReservationMetric {
  id: string
  projectId: string
  clientName: string
  realtorId: string
  createdAt: string
  reservedUntil: string
}

export interface DeveloperRealtorActivityMetric {
  realtorId: string
  projectId: string
  capturedAt: string
  leads: number
  qualified: number
  showings: number
}

export interface DeveloperMarketingMetric {
  id: string
  projectId: string
  source: string
  leads: number
  bookings: number
  spend: number
}

export interface DeveloperAnalyticsQuery {
  scope: DeveloperAnalyticsScope
  period: DeveloperAnalyticsPeriod
  managerId?: string
  projectId?: string
}

export interface DeveloperAnalyticsKpi {
  totalUnits: number
  availableUnits: number
  reservedUnits: number
  soldUnits: number
  activeBookings: number
  expiringBookings: number
  salesCount: number
  salesPlan: number
  revenue: number
  revenuePlan: number
  planPercent: number
  revenuePlanPercent: number
}

export interface DeveloperFunnelStep {
  stage: DeveloperFunnelStage
  count: number
  conversionFromPrevious: number
}

export interface DeveloperSalesPoint {
  date: string
  sales: number
  revenue: number
}

export interface DeveloperRealtorPerformance extends DeveloperRealtorMetric {
  projectIds: string[]
  leads: number
  qualified: number
  showings: number
  bookings: number
  sales: number
  revenue: number
  averageCheck: number
  bookingConversion: number
  salesConversion: number
  salesShare: number
  lastSaleAt: string | null
  reservedClients: number
}

export interface DeveloperRealtorSummary {
  activeRealtors: number
  leads: number
  bookings: number
  sales: number
  revenue: number
  averageCheck: number
  salesShare: number
  revenueShare: number
  reservedClients: number
}

export interface DeveloperAnalyticsSnapshot {
  query: DeveloperAnalyticsQuery
  projects: DeveloperProjectMetric[]
  managers: DeveloperManagerMetric[]
  bookings: DeveloperBookingMetric[]
  sales: DeveloperSaleMetric[]
  tasks: DeveloperTaskMetric[]
  funnel: DeveloperFunnelStep[]
  realtorSalesFunnel: DeveloperFunnelStep[]
  realtors: DeveloperRealtorPerformance[]
  realtorSummary: DeveloperRealtorSummary
  reservations: DeveloperReservationMetric[]
  marketing: Array<DeveloperMarketingMetric & { conversion: number; costPerLead: number }>
  salesSeries: DeveloperSalesPoint[]
  kpi: DeveloperAnalyticsKpi
}
