import type {
  ActivityTimeseriesPoint,
  AnalyticsData,
  AnalyticsPeriod,
  DynamicKpi,
  FunnelBoard,
  LeadsTimeseriesPoint,
  PartnerRow,
  StaticKpi,
} from '@/types/analytics';

type DateRange = {
  start: Date;
  end: Date;
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
  // activity series
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

const EMPTY_PARTNERS: PartnerRow[] = [];

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  week: 'Эта неделя',
  month: 'Этот месяц',
  allTime: 'За всё время',
};

export function getPeriodDateRange(period: AnalyticsPeriod): DateRange {
  const now = new Date();

  if (period === 'week') {
    const day = now.getDay() || 7;
    const start = new Date(now);
    start.setDate(now.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // allTime – пока просто текущая дата как заглушка
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date();
  return { start, end };
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Заполняет таймсерию лидов по всем дням периода (по дате создания); дни без данных = 0. Для allTime — по месяцам текущего года. */
export function fillLeadsTimeseriesForPeriod(
  timeseries: LeadsTimeseriesPoint[],
  period: AnalyticsPeriod
): LeadsTimeseriesPoint[] {
  const range = getPeriodDateRange(period);

  if (period === 'allTime') {
    const byMonth: Record<string, number> = {};
    for (const p of timeseries) {
      const dateStr = typeof p.date === 'string' ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10);
      const monthKey = dateStr.slice(0, 7);
      byMonth[monthKey] = (byMonth[monthKey] ?? 0) + (p.leads ?? 0);
    }
    const result: LeadsTimeseriesPoint[] = [];
    const year = range.start.getFullYear();
    const endMonth = range.end.getMonth();
    for (let m = 0; m <= endMonth; m += 1) {
      const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
      result.push({ date: `${monthKey}-01`, leads: byMonth[monthKey] ?? 0 });
    }
    if (result.length === 0) {
      result.push({ date: `${year}-01-01`, leads: 0 });
    }
    return result;
  }

  const byDate: Record<string, number> = {};
  for (const p of timeseries) {
    const key = typeof p.date === 'string' ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10);
    byDate[key] = p.leads ?? 0;
  }
  const result: LeadsTimeseriesPoint[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const endDate = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
  while (cursor <= endDate) {
    const key = toLocalDateKey(cursor);
    result.push({ date: key, leads: byDate[key] ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result.length > 0 ? result : [{ date: toLocalDateKey(new Date()), leads: 0 }];
}

/** Строит плотный массив активности по дням месяца (индекс = день месяца 0-based) для календаря. */
export function buildDenseMonthActivityTimeseries(
  monthRange: { start: Date; end: Date },
  timeseries: ActivityTimeseriesPoint[]
): ActivityTimeseriesPoint[] {
  const byDate: Record<string, ActivityTimeseriesPoint> = {};
  for (const p of timeseries) {
    const key = typeof p.date === 'string' ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10);
    byDate[key] = { date: key, calls: p.calls ?? 0, chats: p.chats ?? 0, selections: p.selections ?? 0 };
  }
  const result: ActivityTimeseriesPoint[] = [];
  const monthStart = new Date(monthRange.start.getFullYear(), monthRange.start.getMonth(), 1);
  const monthEnd = new Date(monthRange.start.getFullYear(), monthRange.start.getMonth() + 1, 0);
  const cursor = new Date(monthStart);
  while (cursor <= monthEnd) {
    const key = toLocalDateKey(cursor);
    const point = byDate[key];
    result.push(
      point ?? { date: key, calls: 0, chats: 0, selections: 0 }
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function getAnalyticsData(period: AnalyticsPeriod): AnalyticsData {
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
    staticKpi: { ...EMPTY_STATIC_KPI },
    dynamicKpi: { ...EMPTY_DYNAMIC_KPI },
    leadsTimeseries,
    activityTimeseries,
    funnels: EMPTY_FUNNELS,
    partners: EMPTY_PARTNERS,
    maxLeadsAdded: 0,
    maxStageChangesCount: 0,
  };
}

