export interface MoneyAmountSum {
  currency: string;
  amountMinorUnits: number;
}

export interface LeadFunnelStage {
  stage: string;
  leadCount: number;
}

export interface LeadFunnelReportResponse {
  stages: LeadFunnelStage[];
}

export interface PositionReportItem {
  positionId: string | null;
  leadsTotal: number;
  leadsByStage: Record<string, number>;
  dealsTotal: number;
  dealsByStage: Record<string, number>;
  dealsCommission: MoneyAmountSum[];
}

export interface PositionsReportResponse {
  positions: PositionReportItem[];
}

export interface TeamPerformanceSummary {
  leadsTotal: number;
  leadsConverted: number;
  conversionRatePercent: number;
  dealsTotal: number;
  dealsWon: number;
  dealsCommission: MoneyAmountSum[];
  tasksTotal: number;
  tasksCompleted: number;
  slaPercent: number;
}

export interface TeamPerformancePositionItem {
  positionId: string | null;
  leadsAdded: number;
  leadsInWork: number;
  leadsConverted: number;
  leadsLost: number;
  conversionRatePercent: number;
  dealsTotal: number;
  dealsWon: number;
  dealsLost: number;
  dealsCommission: MoneyAmountSum[];
  tasksTotal: number;
  tasksCompleted: number;
  tasksOverdue: number;
  tasksCompletedOnTime: number;
  slaPercent: number;
}

export interface TeamPerformanceTimeseriesPoint {
  date: string;
  leads: number;
  deals: number;
  completedTasks: number;
}

export interface TeamPerformanceReportResponse {
  summary: TeamPerformanceSummary;
  positions: TeamPerformancePositionItem[];
  timeseries: TeamPerformanceTimeseriesPoint[];
}
