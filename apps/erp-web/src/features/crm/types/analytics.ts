// Контракт данных аналитики (план/факт, воронки, графики).

export type AnalyticsPeriod = "week" | "month" | "allTime";

export interface StaticKpi {
  level1Referrals: number;
  totalListings: number;
  totalLeads: number;
  totalDeals: number;
}

export interface DynamicKpi {
  addedListings: number;
  addedLevel1Referrals: number;
  addedLevel2Referrals: number;
  addedLeads: number;
  callClicks: number;
  chatOpens: number;
  selectionsCreated: number;
  deals: number;
}

export interface LeadsTimeseriesPoint {
  date: string;
  leads: number;
}

export interface ActivityTimeseriesPoint {
  date: string;
  calls: number;
  chats: number;
  selections: number;
}

export type FunnelId = "sales" | "network" | "owner" | "broker";

export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  count: number;
}

export interface FunnelColumn {
  id: string;
  name: string;
  count: number;
  stages: FunnelStage[];
}

export interface FunnelBoard {
  id: FunnelId;
  name: string;
  shortName: string;
  totalCount: number;
  activeCount: number;
  rejectionCount: number;
  closedCount: number;
  columns: FunnelColumn[];
}

export type ActivityMarker = "green" | "yellow" | "red";

/** Сводка по этапам продаж для колонки «Активность» в лидерборде: 4 группы. */
export interface SalesStageCounts {
  /** Отказ (брак, не дозвонился и т.д.) */
  rejection: number;
  /** В работе (новые, контакт, презентация) */
  inProgress: number;
  /** Переговоры и КП (КП, возражения, задаток, договор) */
  negotiation: number;
  /** Купили (золотой фонд, постпродаж) */
  success: number;
}

export interface PartnerRow {
  id: string;
  avatarUrl: string;
  name: string;
  /** true, если это аккаунт текущего пользователя (в лидерборде показываем имя как «Я») */
  isCurrentUser?: boolean;
  isOnline: boolean;
  /** Минут с последней активности; null = данных нет (не подставлять «только что») */
  lastSeenMinutesAgo: number | null;
  /** true только если lastSeenMinutesAgo пришёл с бэкенда (отчёт), иначе не показывать как факт */
  lastSeenKnown?: boolean;
  activityMarker: ActivityMarker;
  platformMinutesToday: number;
  crmMinutesToday: number;
  /** true только если минуты за сегодня из отчёта или из getOnlineStats, иначе не показывать «0 мин» */
  todayMinutesKnown?: boolean;
  level2Count: number;
  level1Count: number; // Добавлено: количество рефералов L1
  leadsAdded: number;
  callClicks: number;
  chatOpens: number;
  selectionsCreated: number;
  activityTotal: number;
  stageChangesCount: number;
  onlineDaysLast7: number;
  /** Сумма минут в сети за последние 7 дней (из getOnlineStats), для отображения «X ч Y мин» */
  totalMinutesLast7?: number;
  onlineWeekMarkers: ActivityMarker[];
  commissionUsd: number;
  /** Количество лидов по этапам продаж (4 группы). Заполняется из leads-by-email-by-stage по email партнёра. */
  salesStageCounts?: SalesStageCounts;
}

export type SortColumn =
  | "leadsAdded"
  | "stageChangesCount"
  | "activityTotal"
  | "onlineDaysLast7"
  | "commissionUsd";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

export interface AnalyticsData {
  period: AnalyticsPeriod;
  periodLabel: string;
  staticKpi: StaticKpi;
  dynamicKpi: DynamicKpi;
  leadsTimeseries: LeadsTimeseriesPoint[];
  activityTimeseries: ActivityTimeseriesPoint[];
  /** Для календаря активности: по дням месяца (индекс = день 0-based). */
  monthActivityTimeseries?: ActivityTimeseriesPoint[];
  /** Для календаря активности: последние 12 месяцев. */
  allTimeActivityTimeseries?: ActivityTimeseriesPoint[];
  funnels: FunnelBoard[];
  partners: PartnerRow[];
  maxLeadsAdded: number;
  maxStageChangesCount: number;
}

export interface PersonProfile {
  id: string;
  name: string;
  avatarUrl: string;
  isOnline: boolean;
  lastSeenMinutesAgo: number | null;
  activityMarker: ActivityMarker;
  platformMinutesToday: number;
  crmMinutesToday: number;
  level2Count: number;
  level1Count: number; // Добавлено: количество рефералов L1
  onlineDaysLast7: number;
}

export interface PersonAnalyticsData {
  period: AnalyticsPeriod;
  periodLabel: string;
  person: PersonProfile;
  staticKpi: StaticKpi;
  dynamicKpi: DynamicKpi;
  leadsTimeseries: LeadsTimeseriesPoint[];
  activityTimeseries: ActivityTimeseriesPoint[];
  /** Для календаря активности: по дням месяца (индекс = день месяца 0-based). Заполняется только для mode "me". */
  monthActivityTimeseries?: ActivityTimeseriesPoint[];
  /** Для календаря активности: последние периоды (например 12 месяцев). Заполняется только для mode "me". */
  allTimeActivityTimeseries?: ActivityTimeseriesPoint[];
  funnels: FunnelBoard[];
  referrals: PartnerRow[];
  maxLeadsAdded: number;
  maxStageChangesCount: number;
}