import type {
  ActivityTimeseriesPoint,
  AnalyticsPeriod,
  DynamicKpi,
  FunnelBoard,
  LeadsTimeseriesPoint,
  PartnerRow,
  PersonAnalyticsData,
  PersonProfile,
  StaticKpi,
} from '@/types/analytics';
import { getPeriodDateRange as getNetworkPeriodDateRange } from './analyticsData';

const EMPTY_PERSON: PersonProfile = {
  id: 'me',
  name: 'Вы',
  avatarUrl: '',
  isOnline: false,
  lastSeenMinutesAgo: null,
  activityMarker: 'yellow',
  platformMinutesToday: 0,
  crmMinutesToday: 0,
  level2Count: 0,
  level1Count: 0,
  onlineDaysLast7: 0,
};

const EMPTY_STATIC_KPI: StaticKpi = {
  level1Referrals: 0,
  totalListings: 0,
  totalLeads: 0,
  totalDeals: 0,
};

const EMPTY_DYNAMIC_KPI: DynamicKpi = {
  addedListings: 0,
  addedLevel1Referrals: 0,
  addedLevel2Referrals: 0,
  addedLeads: 0,
  callClicks: 0,
  chatOpens: 0,
  selectionsCreated: 0,
  deals: 0,
};

const EMPTY_TIMESERIES_POINT: LeadsTimeseriesPoint & ActivityTimeseriesPoint = {
  date: new Date().toISOString(),
  leads: 0,
  // activity
  calls: 0,
  chats: 0,
  selections: 0,
};

const EMPTY_FUNNELS: FunnelBoard[] = [
  {
    id: 'sales',
    name: 'Продажи',
    shortName: 'Продажи',
    totalCount: 0,
    activeCount: 0,
    rejectionCount: 0,
    closedCount: 0,
    columns: [
      {
        id: 'rejection',
        name: 'Отказ',
        count: 0,
        stages: [],
      },
      {
        id: 'in_progress',
        name: 'В работе',
        count: 0,
        stages: [],
      },
      {
        id: 'success',
        name: 'Купили',
        count: 0,
        stages: [],
      },
    ],
  },
];

const EMPTY_REFERRALS: PartnerRow[] = [];

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  week: 'Эта неделя',
  month: 'Этот месяц',
  allTime: 'За всё время',
};

export function getCurrentUserId(): string {
  return 'me';
}

export function getPersonPeriodDateRange(period: AnalyticsPeriod) {
  return getNetworkPeriodDateRange(period);
}

export function getPersonAnalyticsData(
  personId: string,
  period: AnalyticsPeriod,
): PersonAnalyticsData {
  const periodLabel = PERIOD_LABELS[period] ?? PERIOD_LABELS.week;

  const leadsTimeseries: LeadsTimeseriesPoint[] = [
    {
      date: EMPTY_TIMESERIES_POINT.date,
      leads: 0,
    },
  ];

  const activityTimeseries: ActivityTimeseriesPoint[] = [
    {
      date: EMPTY_TIMESERIES_POINT.date,
      calls: 0,
      chats: 0,
      selections: 0,
    },
  ];

  return {
    period,
    periodLabel,
    person: { ...EMPTY_PERSON, id: personId || EMPTY_PERSON.id },
    staticKpi: { ...EMPTY_STATIC_KPI },
    dynamicKpi: { ...EMPTY_DYNAMIC_KPI },
    leadsTimeseries,
    activityTimeseries,
    funnels: EMPTY_FUNNELS,
    referrals: EMPTY_REFERRALS,
    maxLeadsAdded: 0,
    maxStageChangesCount: 0,
  };
}

