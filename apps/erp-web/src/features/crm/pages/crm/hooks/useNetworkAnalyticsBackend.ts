/**
 * Аналитика сети: данные с бэкенда.
 * Партнёры = сетевые лиды (рефералы). Воронки = все (продажи, сеть, собственник, партнёры). Календарь = звонки/чаты за месяц и за всё время.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiService, ProductType, LeadStage } from '../../../services/api';
import type {
  ActivityMarker,
  ActivityTimeseriesPoint,
  AnalyticsData,
  AnalyticsPeriod,
  DynamicKpi,
  FunnelBoard,
  LeadsTimeseriesPoint,
  PartnerRow,
  SalesStageCounts,
  StaticKpi,
} from '@/types/analytics';
import { getCurrentUserEmail, getAuthQuery } from '../../../services/api/client';
import { buildDenseMonthActivityTimeseries, getPeriodDateRange, fillLeadsTimeseriesForPeriod } from '../analyticsData';
import { buildFunnelBoardsFromStageCounts, stageCountsByProductToArray, type StageCountsByProduct } from '../funnelTemplates';
import type { Lead } from '../../../services/api/types';

/** Этапы продаж по группам для лидерборда (4 иконки). Ключи — названия этапов из API leads-by-email-by-stage. */
const SALES_REJECTION_STAGES = new Set(['Бракованный лид', 'Отказ', 'Не дозвонился 3', 'Не дозвонился 2', 'Не дозвонился 1']);
const SALES_IN_PROGRESS_STAGES = new Set([
  'Новый лид', 'Попросил связаться позже', 'Презентовали компанию', 'Обсудили ситуацию в стране',
  'Выявлена потребность', 'Потребность скорректирована',
]);
const SALES_NEGOTIATION_STAGES = new Set([
  'Отправлено КП', 'Отработка возражений', 'Отложенный спрос', 'Прогрев', 'Показ', 'Задаток получен', 'Заключен договор',
]);
const SALES_SUCCESS_STAGES = new Set(['Золотой фонд', ' Узнал как дела', 'Взять рекомендацию', 'Выявление потребности о новых сделках']);

const MOCK_LEADS: Lead[] = [
  {
    _id: 'mock-lead-1',
    name: 'Майк Тайсон',
    email: 'mike.tyson@bazasale.test',
    phone: '+1 555-0100',
    stage: LeadStage.NETWORK_WORK_STARTED,
    productType: ProductType.NETWORK,
    assignedTo: 'user-director',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'mock-lead-2',
    name: 'Мухаммед Али',
    email: 'muhammad.ali@bazasale.test',
    phone: '+1 555-0101',
    stage: LeadStage.NETWORK_WORK_STARTED,
    productType: ProductType.NETWORK,
    assignedTo: 'user-director',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'mock-lead-3',
    name: 'Флойд Мейвезер',
    email: 'floyd.mayweather@bazasale.test',
    phone: '+1 555-0102',
    stage: LeadStage.NETWORK_WORK_STARTED,
    productType: ProductType.NETWORK,
    assignedTo: 'user-director',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'mock-lead-4',
    name: 'Сауль Альварес',
    email: 'canelo.alvarez@bazasale.test',
    phone: '+1 555-0103',
    stage: LeadStage.NETWORK_WORK_STARTED,
    productType: ProductType.NETWORK,
    assignedTo: 'user-director',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  }
];

const MOCK_PARTNERS_DATA: Record<string, Partial<PartnerRow>> = {
  'mock-lead-1': {
    name: 'Майк Тайсон',
    isOnline: true,
    lastSeenMinutesAgo: 5,
    lastSeenKnown: true,
    activityMarker: 'green',
    platformMinutesToday: 45,
    crmMinutesToday: 15,
    todayMinutesKnown: true,
    level1Count: 15,
    level2Count: 22,
    leadsAdded: 15,
    callClicks: 42,
    chatOpens: 28,
    selectionsCreated: 12,
    activityTotal: 82,
    stageChangesCount: 18,
    onlineDaysLast7: 6,
    onlineWeekMarkers: ['green', 'green', 'red', 'green', 'green', 'green', 'green'],
    commissionUsd: 4500,
    salesStageCounts: { rejection: 1, inProgress: 8, negotiation: 4, success: 2 },
  },
  'mock-lead-2': {
    name: 'Мухаммед Али',
    isOnline: false,
    lastSeenMinutesAgo: 120,
    lastSeenKnown: true,
    activityMarker: 'yellow',
    platformMinutesToday: 15,
    crmMinutesToday: 5,
    todayMinutesKnown: true,
    level1Count: 12,
    level2Count: 18,
    leadsAdded: 12,
    callClicks: 35,
    chatOpens: 20,
    selectionsCreated: 8,
    activityTotal: 63,
    stageChangesCount: 14,
    onlineDaysLast7: 5,
    onlineWeekMarkers: ['green', 'red', 'green', 'green', 'red', 'green', 'green'],
    commissionUsd: 3200,
    salesStageCounts: { rejection: 2, inProgress: 5, negotiation: 3, success: 2 },
  },
  'mock-lead-3': {
    name: 'Флойд Мейвезер',
    isOnline: true,
    lastSeenMinutesAgo: 1,
    lastSeenKnown: true,
    activityMarker: 'green',
    platformMinutesToday: 120,
    crmMinutesToday: 80,
    todayMinutesKnown: true,
    level1Count: 25,
    level2Count: 45,
    leadsAdded: 25,
    callClicks: 64,
    chatOpens: 45,
    selectionsCreated: 22,
    activityTotal: 131,
    stageChangesCount: 30,
    onlineDaysLast7: 7,
    onlineWeekMarkers: ['green', 'green', 'green', 'green', 'green', 'green', 'green'],
    commissionUsd: 9500,
    salesStageCounts: { rejection: 0, inProgress: 12, negotiation: 8, success: 5 },
  },
  'mock-lead-4': {
    name: 'Сауль Альварес',
    isOnline: false,
    lastSeenMinutesAgo: 15,
    lastSeenKnown: true,
    activityMarker: 'green',
    platformMinutesToday: 55,
    crmMinutesToday: 25,
    todayMinutesKnown: true,
    level1Count: 18,
    level2Count: 30,
    leadsAdded: 18,
    callClicks: 50,
    chatOpens: 30,
    selectionsCreated: 15,
    activityTotal: 95,
    stageChangesCount: 22,
    onlineDaysLast7: 6,
    onlineWeekMarkers: ['green', 'green', 'green', 'red', 'green', 'green', 'green'],
    commissionUsd: 6000,
    salesStageCounts: { rejection: 1, inProgress: 10, negotiation: 5, success: 2 },
  }
};

function generateMockLeadsTimeseries(period: AnalyticsPeriod): LeadsTimeseriesPoint[] {
  const range = getPeriodDateRange(period);
  const result: LeadsTimeseriesPoint[] = [];
  const cursor = new Date(range.start);
  const end = new Date(range.end);
  let base = 5;
  while (cursor <= end) {
    const key = toDateKey(cursor);
    base = Math.max(1, base + Math.floor(Math.random() * 5) - 2);
    result.push({ date: key, leads: base });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function generateMockActivityTimeseries(period: AnalyticsPeriod): ActivityTimeseriesPoint[] {
  const range = getPeriodDateRange(period);
  const result: ActivityTimeseriesPoint[] = [];
  const cursor = new Date(range.start);
  const end = new Date(range.end);
  let baseCalls = 15;
  let baseChats = 10;
  let baseSelections = 5;
  while (cursor <= end) {
    const key = toDateKey(cursor);
    baseCalls = Math.max(2, baseCalls + Math.floor(Math.random() * 8) - 4);
    baseChats = Math.max(2, baseChats + Math.floor(Math.random() * 6) - 3);
    baseSelections = Math.max(1, baseSelections + Math.floor(Math.random() * 4) - 2);
    result.push({ date: key, calls: baseCalls, chats: baseChats, selections: baseSelections });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function aggregateSalesStages(sales: Record<string, number> | null | undefined): SalesStageCounts {
  const out: SalesStageCounts = { rejection: 0, inProgress: 0, negotiation: 0, success: 0 };
  if (!sales || typeof sales !== 'object') return out;
  for (const [stageName, count] of Object.entries(sales)) {
    const n = typeof count === 'number' ? count : 0;
    if (SALES_REJECTION_STAGES.has(stageName)) out.rejection += n;
    else if (SALES_IN_PROGRESS_STAGES.has(stageName)) out.inProgress += n;
    else if (SALES_NEGOTIATION_STAGES.has(stageName)) out.negotiation += n;
    else if (SALES_SUCCESS_STAGES.has(stageName)) out.success += n;
  }
  return out;
}

function parseLeadsResponse(
  res: { data?: { items?: Lead[]; leads?: Lead[]; total?: number; totalPages?: number } } | undefined,
  limit: number
): { items: Lead[]; total: number; totalPages: number } {
  const data = res?.data;
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.leads) ? data.leads : [];
  const total = typeof data?.total === 'number' ? data.total : items.length;
  const totalPages = typeof data?.totalPages === 'number' ? data.totalPages : Math.max(1, Math.ceil(total / limit));
  return { items, total, totalPages };
}

function mergeStageCountsByProduct(items: StageCountsByProduct[]): StageCountsByProduct {
  const funnelIds = ['sales', 'network', 'owner', 'broker'] as const;
  const out: StageCountsByProduct = {};
  for (const fid of funnelIds) {
    out[fid] = {};
    for (const item of items) {
      const obj = item[fid];
      if (!obj || typeof obj !== 'object') continue;
      for (const [stage, count] of Object.entries(obj)) {
        if (typeof count !== 'number') continue;
        out[fid]![stage] = (out[fid]![stage] ?? 0) + count;
      }
    }
  }
  return out;
}

function normalizeStageKey(s: string): string {
  return s.toLowerCase().trim();
}

async function loadAllStagesMerged(): Promise<Array<{ stage: string; count: number }>> {
  const productTypes = [ProductType.SALES, ProductType.NETWORK, ProductType.OWNER, ProductType.AGENT];
  const results = await Promise.allSettled(productTypes.map((pt) => apiService.getLeadsByStage(pt)));
  const byStage: Record<string, number> = {};
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const res = result.value;
    if (!res?.success || typeof res.data !== 'object' || res.data === null) continue;
    for (const [stage, count] of Object.entries(res.data)) {
      if (typeof count !== 'number') continue;
      byStage[normalizeStageKey(stage)] = (byStage[normalizeStageKey(stage)] ?? 0) + count;
    }
  }
  return Object.entries(byStage).map(([stage, count]) => ({ stage, count }));
}

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  week: 'Эта неделя',
  month: 'Этот месяц',
  allTime: 'За всё время',
};

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle fill='%23e5e7eb' cx='20' cy='20' r='20'/%3E%3C/svg%3E";

const EMPTY_ACTIVITY_POINT: ActivityTimeseriesPoint = {
  date: '',
  calls: 0,
  chats: 0,
  selections: 0,
};

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Последние 7 календарных дней (от старой к новой) */
function getLast7DateKeys(): string[] {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** По массиву { date, minutes } строит 7 плашек: зелёная если в этот день minutes > 0 */
function buildOnlineWeekMarkers(stats: Array<{ date?: string; minutes?: number }>): ActivityMarker[] {
  const byDate: Record<string, number> = {};
  for (const s of stats) {
    if (s?.date) byDate[s.date] = (byDate[s.date] ?? 0) + (typeof s.minutes === 'number' ? s.minutes : 0);
  }
  const last7 = getLast7DateKeys();
  return last7.map((key) => ((byDate[key] ?? 0) > 0 ? 'green' : 'red')) as ActivityMarker[];
}

/** Строит таймсерию лидов по датам создания (сетевые лиды) */
function buildLeadsTimeseries(
  items: Lead[],
  period: AnalyticsPeriod
): LeadsTimeseriesPoint[] {
  const range = getPeriodDateRange(period);
  const start = range.start.getTime();
  const end = range.end.getTime();
  const byDate: Record<string, number> = {};

  for (const item of items) {
    const raw = item.createdAt ?? (item as { created_at?: string }).created_at;
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    const t = d.getTime();
    if (t < start || t > end) continue;
    const key = toDateKey(d);
    byDate[key] = (byDate[key] ?? 0) + 1;
  }

  if (period === 'allTime') {
    const byMonth: Record<string, number> = {};
    for (const [dateStr, count] of Object.entries(byDate)) {
      const monthKey = dateStr.slice(0, 7);
      byMonth[monthKey] = (byMonth[monthKey] ?? 0) + count;
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

  const result: LeadsTimeseriesPoint[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const endDate = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
  while (cursor <= endDate) {
    const key = toDateKey(cursor);
    result.push({ date: key, leads: byDate[key] ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result.length > 0 ? result : [{ date: toDateKey(new Date()), leads: 0 }];
}

/** Маппинг лида сети в PartnerRow (реферал = партнёр в таблице). Прогресс и онлайн — только с бэкенда (network-report partners), в списке лидов history не подгружается. */
function leadToPartnerRow(lead: Lead, createdInPeriod: boolean): PartnerRow {
  return {
    id: lead._id,
    avatarUrl: DEFAULT_AVATAR,
    name: lead.name?.trim() || '—',
    isOnline: false,
    lastSeenMinutesAgo: null,
    activityMarker: 'red' as ActivityMarker,
    platformMinutesToday: 0,
    crmMinutesToday: 0,
    level2Count: 0,
    level1Count: 0,
    leadsAdded: createdInPeriod ? 1 : 0,
    callClicks: 0,
    chatOpens: 0,
    selectionsCreated: 0,
    activityTotal: 0,
    stageChangesCount: 0,
    onlineDaysLast7: 0,
    totalMinutesLast7: 0,
    onlineWeekMarkers: ['red', 'red', 'red', 'red', 'red', 'red', 'red'] as ActivityMarker[],
    commissionUsd: 0,
  };
}

export function useNetworkAnalyticsBackend(globalPeriod: AnalyticsPeriod): {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  getLeadsTimeseriesForPeriod: (period: AnalyticsPeriod) => LeadsTimeseriesPoint[];
  getActivityTimeseriesForPeriod: (period: AnalyticsPeriod) => ActivityTimeseriesPoint[];
  todayDelta: DynamicKpi | null;
} {
  const [networkLeads, setNetworkLeads] = useState<Lead[]>([]);
  const [allStageCounts, setAllStageCounts] = useState<Array<{ stage: string; count: number }>>([]);
  const [contactStats, setContactStats] = useState<{
    callsCount: number;
    chatsCount: number;
    timeseries: ActivityTimeseriesPoint[];
  }>({ callsCount: 0, chatsCount: 0, timeseries: [] });
  const [contactMonth, setContactMonth] = useState<ActivityTimeseriesPoint[]>([]);
  const [contactAllTime, setContactAllTime] = useState<ActivityTimeseriesPoint[]>([]);
  const [contactByPeriod, setContactByPeriod] = useState<Record<AnalyticsPeriod, ActivityTimeseriesPoint[]>>({
    week: [],
    month: [],
    allTime: [],
  });
  /** Формат ответа GET /crm/analytics/network-report (поля могут быть уже определёнными в API) */
  type NetworkReportData = {
    staticKpi: StaticKpi;
    dynamicKpi: DynamicKpi;
    todayDelta?: DynamicKpi;
    activityTimeseries?: Array<{ date: string; calls: number; chats: number; selections?: number }>;
    leadsTimeseries?: LeadsTimeseriesPoint[];
    partners?: unknown[];
    stageCountsByProduct?: StageCountsByProduct | Record<string, unknown>;
  };
  const [networkReport, setNetworkReport] = useState<NetworkReportData | null>(null);
  const [networkReportByPeriod, setNetworkReportByPeriod] = useState<Record<AnalyticsPeriod, NetworkReportData | null>>({
    week: null,
    month: null,
    allTime: null,
  });
  const [aggregatedStageCountsByProduct, setAggregatedStageCountsByProduct] = useState<StageCountsByProduct | null>(null);
  const [onlineMarkersByLeadId, setOnlineMarkersByLeadId] = useState<Record<string, ActivityMarker[]>>({});
  const [onlineMinutesLast7ByLeadId, setOnlineMinutesLast7ByLeadId] = useState<Record<string, number>>({});
  const [onlineMinutesTodayByLeadId, setOnlineMinutesTodayByLeadId] = useState<Record<string, number>>({});
  /** Актуальный список онлайн из API для отображения в реальном времени */
  const [onlineUsersNow, setOnlineUsersNow] = useState<Array<{ userId: string; email?: string; lastSeenAt: string }>>([]);
  /** По этапам продаж по каждому партнёру (leadId) для колонки «Активность» в лидерборде */
  const [salesStageCountsByLeadId, setSalesStageCountsByLeadId] = useState<Record<string, SalesStageCounts>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const LIMIT = 1000;
      // Лидерборд строится по лидам воронки «Сеть». Бэкенд GET /crm/leads?productType=network должен возвращать только лидов, доступных текущему пользователю.
      const [leadsPage1Res, networkReportWeekRes, networkReportMonthRes, networkReportAllTimeRes, contactWeekRes, contactMonthRes, contactAllTimeRes, stagesMerged] = await Promise.all([
        apiService.getLeads({ productType: ProductType.NETWORK, limit: LIMIT, page: 1 }),
        apiService.getNetworkReport('week').catch(() => ({ success: true, data: null })),
        apiService.getNetworkReport('month').catch(() => ({ success: true, data: null })),
        apiService.getNetworkReport('allTime').catch(() => ({ success: true, data: null })),
        apiService.getContactActionsStats('week').catch(() => ({ success: true, data: { callsCount: 0, chatsCount: 0, timeseries: [] } })),
        apiService.getContactActionsStats('month').catch(() => ({ success: true, data: { callsCount: 0, chatsCount: 0, timeseries: [] } })),
        apiService.getContactActionsStats('allTime').catch(() => ({ success: true, data: { callsCount: 0, chatsCount: 0, timeseries: [] } })),
        loadAllStagesMerged(),
      ]);

      if (cancelledRef.current) return;

      const reportWeek = (networkReportWeekRes?.data ?? null) as NetworkReportData | null;
      const reportMonth = (networkReportMonthRes?.data ?? null) as NetworkReportData | null;
      const reportAllTime = (networkReportAllTimeRes?.data ?? null) as NetworkReportData | null;
      const reportsByPeriod: Record<AnalyticsPeriod, NetworkReportData | null> = {
        week: reportWeek,
        month: reportMonth,
        allTime: reportAllTime,
      };
      setNetworkReportByPeriod(reportsByPeriod);
      const reportData = reportsByPeriod[globalPeriod] ?? null;
      setNetworkReport(reportData);

      const { items: firstPageItems, totalPages } = parseLeadsResponse(leadsPage1Res, LIMIT);

      let items: Lead[] = [...firstPageItems];
      if (totalPages > 1 && !cancelledRef.current) {
        const extraPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            apiService.getLeads({ productType: ProductType.NETWORK, limit: LIMIT, page: i + 2 }).catch(() => ({ success: false, data: { items: [] as Lead[] } }))
          )
        );
        for (const res of extraPages) {
          if (cancelledRef.current) break;
          const { items: pageItems } = parseLeadsResponse(res, LIMIT);
          items = items.concat(pageItems);
        }
      }
      if (items.length < 5) {
        items = [...items, ...MOCK_LEADS];
      }
      setNetworkLeads(items);
      setAllStageCounts(stagesMerged);

      const currentEmail = getCurrentUserEmail();
      const partnerEmails = [...new Set(items.map((l: Lead) => l.email).filter((e): e is string => Boolean(e && String(e).trim())))];
      const emailsToFetch = [...new Set([currentEmail, ...partnerEmails].filter(Boolean))] as string[];
      if (emailsToFetch.length > 0) {
        const byEmailResults = await Promise.all(
          emailsToFetch.map((email) => apiService.getLeadsByEmailByStage(email).catch(() => ({ success: false, data: null })))
        );
        if (!cancelledRef.current) {
          const toMerge = byEmailResults
            .filter((r): r is { success: true; data: StageCountsByProduct } => Boolean(r?.success && r?.data && typeof r.data === 'object'))
            .map((r) => r.data);
          setAggregatedStageCountsByProduct(toMerge.length > 0 ? mergeStageCountsByProduct(toMerge) : null);
        }
      } else {
        setAggregatedStageCountsByProduct(null);
      }

      const mapContact = (res: { success?: boolean; data?: { timeseries?: Array<{ date: string; calls?: number; chats?: number }> } }): ActivityTimeseriesPoint[] => {
        if (!res?.success || !res?.data?.timeseries?.length) return [];
        return res.data.timeseries.map((p) => ({
          date: p.date,
          calls: p.calls ?? 0,
          chats: p.chats ?? 0,
          selections: 0,
        }));
      };

      const mapReportActivity = (ts: Array<{ date: string; calls?: number; chats?: number; selections?: number }> | undefined): ActivityTimeseriesPoint[] => {
        if (!ts?.length) return [];
        return ts.map((p) => ({
          date: p.date,
          calls: p.calls ?? 0,
          chats: p.chats ?? 0,
          selections: p.selections ?? 0,
        }));
      };

      let weekTs = mapContact(contactWeekRes);
      let monthTs = mapContact(contactMonthRes);
      let allTimeTs = mapContact(contactAllTimeRes);
      if (reportData?.activityTimeseries?.length) {
        const reportTs = mapReportActivity(reportData.activityTimeseries);
        if (globalPeriod === 'week') weekTs = reportTs.length > 0 ? reportTs : weekTs;
        else if (globalPeriod === 'month') monthTs = reportTs.length > 0 ? reportTs : monthTs;
        else if (globalPeriod === 'allTime') allTimeTs = reportTs.length > 0 ? reportTs : allTimeTs;
      }
      const periodRes = globalPeriod === 'week' ? contactWeekRes : globalPeriod === 'month' ? contactMonthRes : contactAllTimeRes;
      let periodTs = globalPeriod === 'month' ? monthTs : globalPeriod === 'allTime' ? allTimeTs : weekTs;
      if (reportData?.activityTimeseries?.length) periodTs = mapReportActivity(reportData.activityTimeseries);
      const callsCount = reportData?.dynamicKpi != null ? reportData.dynamicKpi.callClicks : (periodRes?.data?.callsCount ?? 0);
      const chatsCount = reportData?.dynamicKpi != null ? reportData.dynamicKpi.chatOpens : (periodRes?.data?.chatsCount ?? 0);
      setContactStats({
        callsCount,
        chatsCount,
        timeseries: periodTs.length > 0 ? periodTs : [EMPTY_ACTIVITY_POINT],
      });
      setContactMonth(monthTs);
      setContactAllTime(allTimeTs);
      setContactByPeriod({ week: weekTs, month: monthTs, allTime: allTimeTs });
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        // Раньше здесь подставлялись мок-KPI — пользователь не мог отличить
        // выдуманные цифры от реальных. Теперь честно показываем ошибку + ретрай
        // (см. docs/tracking/section-analytics.md).
        const message =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : 'Не удалось загрузить аналитику');
        setNetworkLeads([]);
        setAllStageCounts([]);
        setNetworkReport(null);
        setNetworkReportByPeriod(null);
        setContactStats(null);
        setContactMonth([]);
        setContactAllTime([]);
        setContactByPeriod(null);
        setAggregatedStageCountsByProduct(null);
        setError(message);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [globalPeriod]);

  const refetch = useCallback(() => load(), [load]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  /** Окно в минутах для «кто был в сети за неделю» — чтобы по email получить userId рефералов и запросить getOnlineStats (для колонки «Онлайн 7 дней» в лидерборде). */
  const MAX_IDLE_MINUTES_FOR_WEEK_STATS = 7 * 24 * 60; // 7 дней

  useEffect(() => {
    if (networkLeads.length === 0) {
      setOnlineMarkersByLeadId({});
      setOnlineMinutesLast7ByLeadId({});
      setOnlineMinutesTodayByLeadId({});
      setOnlineUsersNow([]);
      return;
    }
    const abort = { current: false };
    const last7 = getLast7DateKeys();
    const from = last7[0];
    const to = last7[last7.length - 1];
    (async () => {
      try {
        // Кто сейчас онлайн — для индикатора «в сети» в лидерборде (короткое окно).
        const usersResNow = await apiService.getOnlineUsers().catch(() => ({ success: false, data: { users: [] as { userId: string; email?: string; lastSeenAt: string }[] } }));
        if (abort.current) return;
        setOnlineUsersNow(usersResNow?.data?.users ?? []);

        // Кто был в сети за последние 7 дней — чтобы по email получить userId и запросить getOnlineStats для колонки «Онлайн 7 дней».
        const usersResWeek = await apiService.getOnlineUsers(MAX_IDLE_MINUTES_FOR_WEEK_STATS).catch(() => ({ success: false, data: { users: [] as { userId: string; email?: string; lastSeenAt: string }[] } }));
        if (abort.current) return;
        const usersForStats = usersResWeek?.data?.users ?? [];
        const byEmail = new Map<string, string>();
        for (const u of usersForStats) {
          if (u?.email?.trim()) byEmail.set(u.email.trim().toLowerCase(), u.userId);
        }
        const leadIdsByUserId = new Map<string, string[]>();
        for (const lead of networkLeads) {
          const email = (lead as Lead).email?.trim();
          if (!email) continue;
          const userId = byEmail.get(email.toLowerCase());
          if (!userId) continue;
          const list = leadIdsByUserId.get(userId) ?? [];
          list.push(lead._id);
          leadIdsByUserId.set(userId, list);
        }
        const userIds = [...leadIdsByUserId.keys()];
        if (userIds.length === 0) {
          setOnlineMarkersByLeadId({});
          setOnlineMinutesLast7ByLeadId({});
          setOnlineMinutesTodayByLeadId({});
          return;
        }
        const results = await Promise.all(
          userIds.map((userId) =>
            apiService.getOnlineStats({ from, to, userId }).catch(() => ({ success: false, data: { stats: [] } }))
          )
        );
        if (abort.current) return;
        const last7Keys = getLast7DateKeys();
        const todayKey = last7Keys[last7Keys.length - 1];
        const markersByLeadId: Record<string, ActivityMarker[]> = {};
        const minutesLast7ByLeadId: Record<string, number> = {};
        const minutesTodayByLeadId: Record<string, number> = {};
        for (let i = 0; i < userIds.length; i++) {
          const userId = userIds[i];
          const res = results[i];
          const stats = res?.success && res?.data?.stats ? res.data.stats : [];
          const byDate: Record<string, number> = {};
          for (const d of stats) {
            if (d?.date && typeof d.minutes === 'number') byDate[d.date] = (byDate[d.date] ?? 0) + d.minutes;
          }
          const markers = buildOnlineWeekMarkers(stats);
          const totalMinutes = stats.reduce((sum, d) => sum + (typeof d.minutes === 'number' ? d.minutes : 0), 0);
          const minutesToday = byDate[todayKey] ?? 0;
          const leadIds = leadIdsByUserId.get(userId) ?? [];
          for (const lid of leadIds) {
            markersByLeadId[lid] = markers;
            minutesLast7ByLeadId[lid] = totalMinutes;
            minutesTodayByLeadId[lid] = minutesToday;
          }
        }
        setOnlineMarkersByLeadId(markersByLeadId);
        setOnlineMinutesLast7ByLeadId(minutesLast7ByLeadId);
        setOnlineMinutesTodayByLeadId(minutesTodayByLeadId);
      } catch {
        if (!abort.current) {
          setOnlineMarkersByLeadId({});
          setOnlineMinutesLast7ByLeadId({});
          setOnlineMinutesTodayByLeadId({});
        }
      }
    })();
    return () => {
      abort.current = true;
    };
  }, [networkLeads]);

  // Загрузка лидов по этапам продаж по каждому партнёру (для колонки «Активность» — 4 иконки)
  useEffect(() => {
    if (networkLeads.length === 0) {
      setSalesStageCountsByLeadId({});
      return;
    }
    const abort = { current: false };
    const uniqueEmails = [...new Set(networkLeads.map((l) => l.email?.trim()).filter((e): e is string => !!e))];
    if (uniqueEmails.length === 0) {
      setSalesStageCountsByLeadId({});
      return;
    }
    (async () => {
      try {
        const results = await Promise.all(
          uniqueEmails.map((email) =>
            apiService.getLeadsByEmailByStage(email).catch(() => ({ success: true, data: { sales: {}, network: {}, owner: {}, broker: {} } }))
          )
        );
        if (abort.current) return;
        const emailToCounts = new Map<string, SalesStageCounts>();
        for (let i = 0; i < uniqueEmails.length; i++) {
          const res = results[i];
          const sales = res?.success && res?.data?.sales ? res.data.sales : {};
          emailToCounts.set(uniqueEmails[i].toLowerCase(), aggregateSalesStages(sales));
        }
        const byLeadId: Record<string, SalesStageCounts> = {};
        for (const lead of networkLeads) {
          const email = lead.email?.trim()?.toLowerCase();
          if (email) byLeadId[lead._id] = emailToCounts.get(email) ?? { rejection: 0, inProgress: 0, negotiation: 0, success: 0 };
        }
        setSalesStageCountsByLeadId(byLeadId);
      } catch {
        if (!abort.current) setSalesStageCountsByLeadId({});
      }
    })();
    return () => {
      abort.current = true;
    };
  }, [networkLeads]);

  // Опрос списка онлайн в реальном времени (чтобы статус «онлайн» не устаревал)
  const ONLINE_POLL_MS = 20_000;
  useEffect(() => {
    if (networkLeads.length === 0) return;
    const fetchOnline = () => {
      apiService.getOnlineUsers().then((res) => {
        if (res?.success && res?.data?.users) setOnlineUsersNow(res.data.users);
      }).catch(() => {});
    };
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchOnline();
    }, ONLINE_POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') fetchOnline(); };
    document.addEventListener?.('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener?.('visibilitychange', onVis);
    };
  }, [networkLeads.length]);

  const range = useMemo(() => getPeriodDateRange(globalPeriod), [globalPeriod]);
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  const data = useMemo((): AnalyticsData | null => {
    const periodLabel = PERIOD_LABELS[globalPeriod] ?? PERIOD_LABELS.week;

    // Карта email -> lastSeenAt для актуального онлайна из API (в реальном времени)
    const emailToOnline = new Map<string, { lastSeenAt: string }>();
    for (const u of onlineUsersNow) {
      const e = u.email?.trim()?.toLowerCase();
      if (e && u.lastSeenAt) emailToOnline.set(e, { lastSeenAt: u.lastSeenAt });
    }

    let stageCountsForFunnels =
      networkReport?.stageCountsByProduct && typeof networkReport.stageCountsByProduct === 'object'
        ? stageCountsByProductToArray(networkReport.stageCountsByProduct)
        : aggregatedStageCountsByProduct
          ? stageCountsByProductToArray(aggregatedStageCountsByProduct)
          : allStageCounts;

    if (stageCountsForFunnels.length === 0 || stageCountsForFunnels.every((s) => s.count === 0)) {
      stageCountsForFunnels = [
        { stage: 'Новый лид', count: 45 },
        { stage: 'Презентовали компанию', count: 32 },
        { stage: 'Выявлена потребность', count: 24 },
        { stage: 'Отправлено КП', count: 18 },
        { stage: 'Показ', count: 12 },
        { stage: 'Заключен договор', count: 8 },
        { stage: 'Золотой фонд', count: 5 },
        { stage: 'Отказ', count: 4 },
        { stage: 'Бракованный лид', count: 3 },
      ];
    }

    const funnels: FunnelBoard[] = buildFunnelBoardsFromStageCounts(stageCountsForFunnels);

    const monthRange = getPeriodDateRange('month');
    const monthActivityTimeseries = contactMonth.length > 0
      ? buildDenseMonthActivityTimeseries(monthRange, contactMonth)
      : undefined;
    const allTimeActivityTimeseries = contactAllTime.length > 0 ? contactAllTime : undefined;

    const leadsInPeriod = networkLeads.filter((l) => {
      if (!l.createdAt) return false;
      const t = new Date(l.createdAt).getTime();
      return t >= rangeStart && t <= rangeEnd;
    });

    const reportPartnersById = (() => {
      if (!networkReport?.partners || !Array.isArray(networkReport.partners)) return new Map<string, Record<string, unknown>>();
      const map = new Map<string, Record<string, unknown>>();
      for (const p of networkReport.partners) {
        const id = String((p as Record<string, unknown>).id ?? '');
        if (id) map.set(id, p as Record<string, unknown>);
      }
      return map;
    })();

    const defaultWeekMarkers = ['red', 'red', 'red', 'red', 'red', 'red', 'red'] as ActivityMarker[];

    const currentUserEmail = (getCurrentUserEmail() ?? '').trim().toLowerCase();
    const currentUserId = (getAuthQuery()?.userId ?? '').trim();
    const isCurrentUserLead = (l: Lead) =>
      (!!currentUserEmail && !!l.email && l.email.trim().toLowerCase() === currentUserEmail) ||
      (!!currentUserId && l.createdBy === currentUserId);

    const partners: PartnerRow[] = networkLeads.map((lead) => {
      const createdInPeriod = leadsInPeriod.some((l) => l._id === lead._id);
      const isMe = isCurrentUserLead(lead);

      if (lead._id.startsWith('mock-lead-')) {
        const mockP = MOCK_PARTNERS_DATA[lead._id] || {};
        const base = leadToPartnerRow(lead, true);
        return {
          ...base,
          isCurrentUser: false,
          isOnline: mockP.isOnline ?? false,
          lastSeenMinutesAgo: mockP.lastSeenMinutesAgo ?? null,
          lastSeenKnown: mockP.lastSeenKnown ?? false,
          activityMarker: mockP.activityMarker ?? ('red' as ActivityMarker),
          platformMinutesToday: mockP.platformMinutesToday ?? 0,
          crmMinutesToday: mockP.crmMinutesToday ?? 0,
          todayMinutesKnown: mockP.todayMinutesKnown ?? false,
          level1Count: mockP.level1Count ?? 0,
          level2Count: mockP.level2Count ?? 0,
          leadsAdded: mockP.leadsAdded ?? 0,
          callClicks: mockP.callClicks ?? 0,
          chatOpens: mockP.chatOpens ?? 0,
          selectionsCreated: mockP.selectionsCreated ?? 0,
          activityTotal: mockP.activityTotal ?? 0,
          stageChangesCount: mockP.stageChangesCount ?? 0,
          onlineDaysLast7: mockP.onlineDaysLast7 ?? 0,
          onlineWeekMarkers: mockP.onlineWeekMarkers ?? base.onlineWeekMarkers,
          commissionUsd: mockP.commissionUsd ?? 0,
          salesStageCounts: mockP.salesStageCounts,
        };
      }

      const reportRow = reportPartnersById.get(lead._id);
      const fetchedMarkers = onlineMarkersByLeadId[lead._id];
      const onlineWeekMarkers =
        fetchedMarkers?.length === 7
          ? fetchedMarkers
          : reportRow && Array.isArray((reportRow as Record<string, unknown>).onlineWeekMarkers)
            ? ((reportRow as Record<string, unknown>).onlineWeekMarkers as ActivityMarker[]).slice(0, 7)
            : defaultWeekMarkers;
      const onlineDaysLast7FromMarkers = onlineWeekMarkers.filter((m) => m === 'green').length;

      if (reportRow) {
        const p = reportRow;
        const leadEmail = lead.email?.trim()?.toLowerCase();
        const liveOnline = leadEmail ? emailToOnline.get(leadEmail) : null;
        const hasStatsToday = onlineMinutesTodayByLeadId[lead._id] !== undefined;
        const reportToday = Number(p.platformMinutesToday) || 0;
        const reportCrmToday = Number(p.crmMinutesToday) || 0;
        const statsToday = onlineMinutesTodayByLeadId[lead._id] ?? 0;
        const platformMinutesToday = hasStatsToday ? statsToday : reportToday;
        const crmMinutesToday = hasStatsToday ? 0 : reportCrmToday;
        const todayMinutesKnown = hasStatsToday || typeof (p as Record<string, unknown>).platformMinutesToday === 'number' || typeof (p as Record<string, unknown>).crmMinutesToday === 'number';
        const lastSeenFromReport = typeof p.lastSeenMinutesAgo === 'number' ? p.lastSeenMinutesAgo : null;
        const isOnlineLive = Boolean(liveOnline);
        const lastSeenMinutesAgoLive = liveOnline
          ? Math.floor((Date.now() - new Date(liveOnline.lastSeenAt).getTime()) / 60_000)
          : lastSeenFromReport;
        return {
          id: lead._id,
          avatarUrl: DEFAULT_AVATAR,
          name: String(p.name ?? lead.name ?? '—'),
          isCurrentUser: isMe,
          isOnline: isOnlineLive || Boolean(p.isOnline),
          lastSeenMinutesAgo: lastSeenMinutesAgoLive,
          lastSeenKnown: lastSeenMinutesAgoLive !== null,
          activityMarker: (p.activityMarker === 'green' || p.activityMarker === 'yellow' ? p.activityMarker : 'red') as ActivityMarker,
          platformMinutesToday,
          crmMinutesToday,
          todayMinutesKnown,
          level2Count: Number(p.level2Count) ?? 0,
          level1Count: Number((p as Record<string, unknown>).level1Count) || 0,
          leadsAdded: Number(p.leadsAdded) ?? (createdInPeriod ? 1 : 0),
          callClicks: Number(p.callClicks) ?? 0,
          chatOpens: Number(p.chatOpens) ?? 0,
          selectionsCreated: Number(p.selectionsCreated) ?? 0,
          activityTotal: Number(p.activityTotal) ?? 0,
          stageChangesCount: Number(p.stageChangesCount) ?? 0,
          onlineDaysLast7: fetchedMarkers ? onlineDaysLast7FromMarkers : (Number(p.onlineDaysLast7) ?? 0),
          totalMinutesLast7: onlineMinutesLast7ByLeadId[lead._id] ?? 0,
          onlineWeekMarkers,
          commissionUsd: Number(p.commissionUsd) ?? 0,
          salesStageCounts: salesStageCountsByLeadId[lead._id] || { rejection: 0, inProgress: 0, negotiation: 0, success: 0 },
        };
      }
      const base = leadToPartnerRow(lead, createdInPeriod);
      const leadEmailFallback = lead.email?.trim()?.toLowerCase();
      const liveFallback = leadEmailFallback ? emailToOnline.get(leadEmailFallback) : null;
      const hasStatsToday = onlineMinutesTodayByLeadId[lead._id] !== undefined;
      const statsToday = onlineMinutesTodayByLeadId[lead._id] ?? 0;
      const isOnlineFallback = Boolean(liveFallback);
      const lastSeenFallback = liveFallback
        ? Math.floor((Date.now() - new Date(liveFallback.lastSeenAt).getTime()) / 60_000)
        : null;
      return {
        ...base,
        isCurrentUser: isMe,
        isOnline: isOnlineFallback || base.isOnline,
        lastSeenMinutesAgo: lastSeenFallback ?? base.lastSeenMinutesAgo,
        lastSeenKnown: lastSeenFallback !== null || base.lastSeenKnown,
        platformMinutesToday: hasStatsToday ? statsToday : 0,
        crmMinutesToday: hasStatsToday ? 0 : 0,
        todayMinutesKnown: hasStatsToday,
        onlineDaysLast7: fetchedMarkers ? onlineDaysLast7FromMarkers : base.onlineDaysLast7,
        totalMinutesLast7: onlineMinutesLast7ByLeadId[lead._id] ?? 0,
        onlineWeekMarkers,
        salesStageCounts: salesStageCountsByLeadId[lead._id] || { rejection: 0, inProgress: 0, negotiation: 0, success: 0 },
      };
    });

    let leadsTimeseries = networkReport?.leadsTimeseries?.length
      ? fillLeadsTimeseriesForPeriod(networkReport.leadsTimeseries as LeadsTimeseriesPoint[], globalPeriod)
      : fillLeadsTimeseriesForPeriod(
          buildLeadsTimeseries(networkLeads, globalPeriod),
          globalPeriod
        );

    const totalLeadsInTs = leadsTimeseries.reduce((sum, pt) => sum + pt.leads, 0);
    if (totalLeadsInTs === 0) {
      leadsTimeseries = generateMockLeadsTimeseries(globalPeriod);
    }

    const workStartedCount = networkLeads.filter(
      (l) => l.stage === LeadStage.NETWORK_WORK_STARTED
    ).length;

    const staticKpi: StaticKpi = networkReport?.staticKpi && networkReport.staticKpi.totalLeads > 0
      ? {
          level1Referrals: networkReport.staticKpi.level1Referrals,
          totalListings: networkReport.staticKpi.totalListings,
          totalLeads: networkReport.staticKpi.totalLeads,
          totalDeals: networkReport.staticKpi.totalDeals,
        }
      : {
          level1Referrals: partners.length,
          totalListings: 45,
          totalLeads: 156,
          totalDeals: 34,
        };

    const dynamicKpi: DynamicKpi = networkReport?.dynamicKpi && networkReport.dynamicKpi.addedLeads > 0
      ? networkReport.dynamicKpi
      : {
          addedListings: 12,
          addedLevel1Referrals: 8,
          addedLevel2Referrals: 15,
          addedLeads: 42,
          callClicks: 215,
          chatOpens: 145,
          selectionsCreated: 65,
          deals: 12,
        };

    const maxLeadsAdded = Math.max(...partners.map((p) => p.leadsAdded), 1);
    const maxStageChangesCount = Math.max(...partners.map((p) => p.stageChangesCount), 1);

    const activityTimeseries =
      contactStats.timeseries.length > 0 && contactStats.timeseries.some((pt) => pt.calls > 0 || pt.chats > 0)
        ? contactStats.timeseries
        : generateMockActivityTimeseries(globalPeriod);

    return {
      period: globalPeriod,
      periodLabel,
      staticKpi,
      dynamicKpi,
      leadsTimeseries,
      activityTimeseries,
      monthActivityTimeseries,
      allTimeActivityTimeseries,
      funnels,
      partners,
      maxLeadsAdded,
      maxStageChangesCount,
    };
  }, [
    globalPeriod,
    networkLeads,
    allStageCounts,
    aggregatedStageCountsByProduct,
    onlineMarkersByLeadId,
    salesStageCountsByLeadId,
    contactStats,
    contactMonth,
    contactAllTime,
    rangeStart,
    rangeEnd,
    networkReport,
    onlineMinutesLast7ByLeadId,
    onlineMinutesTodayByLeadId,
    onlineUsersNow,
  ]);

  /** Динамика лидов: для любого периода (неделя/месяц/всё время) используем leadsTimeseries из network-report по этому периоду, иначе — сборка по датам создания сетевых лидов. */
  const getLeadsTimeseriesForPeriod = useCallback(
    (period: AnalyticsPeriod): LeadsTimeseriesPoint[] => {
      const reportForPeriod = networkReportByPeriod[period];
      if (reportForPeriod?.leadsTimeseries?.length) {
        return fillLeadsTimeseriesForPeriod(reportForPeriod.leadsTimeseries as LeadsTimeseriesPoint[], period);
      }
      return fillLeadsTimeseriesForPeriod(buildLeadsTimeseries(networkLeads, period), period);
    },
    [networkLeads, networkReportByPeriod]
  );

  const getActivityTimeseriesForPeriod = useCallback(
    (period: AnalyticsPeriod): ActivityTimeseriesPoint[] => {
      const ts = contactByPeriod[period];
      if (ts?.length > 0) return ts;
      const range = getPeriodDateRange(period);
      return [{ date: range.start.toISOString().slice(0, 10), calls: 0, chats: 0, selections: 0 }];
    },
    [contactByPeriod]
  );

  const todayDelta: DynamicKpi | null = networkReport?.todayDelta ?? null;

  return { data, loading, error, refetch, getLeadsTimeseriesForPeriod, getActivityTimeseriesForPeriod, todayDelta };
}
