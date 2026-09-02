/**
 * Данные аналитики по партнёру по id лида: единый отчёт с бэкенда (lead-report) + онлайн-статус.
 * Используется для карточки партнёра в стиле dashboard-front.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '@/features/crm/services/api';
import type { Lead } from '@/features/crm/services/api/types';

const MAX_IDLE_MINUTES_ONLINE = 10;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function minutesSince(isoDate: string): number {
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}
import type {
  ActivityTimeseriesPoint,
  AnalyticsPeriod,
  DynamicKpi,
  FunnelBoard,
  LeadsTimeseriesPoint,
  PersonProfile,
  StaticKpi,
} from '@/types/analytics';
import { getPeriodDateRange, fillLeadsTimeseriesForPeriod } from '../analyticsData';
import { buildFunnelBoardsFromStageCounts, stageCountsByProductToArray } from '../funnelTemplates';

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  week: 'Эта неделя',
  month: 'Этот месяц',
  allTime: 'За всё время',
};

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle fill='%23e5e7eb' cx='20' cy='20' r='20'/%3E%3C/svg%3E";

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

export interface PartnerAnalyticsData {
  lead: Lead;
  person: PersonProfile;
  periodLabel: string;
  range: { start: Date; end: Date };
  rangeLabel: string;
  staticKpi: StaticKpi;
  dynamicKpi: DynamicKpi;
  funnels: FunnelBoard[];
  leadsTimeseries: LeadsTimeseriesPoint[];
  activityTimeseries: ActivityTimeseriesPoint[];
  monthActivityTimeseries?: ActivityTimeseriesPoint[];
  allTimeActivityTimeseries?: ActivityTimeseriesPoint[];
}

export function usePartnerAnalyticsBackend(
  leadId: string | undefined,
  period: AnalyticsPeriod
): {
  data: PartnerAnalyticsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<PartnerAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const partnerEmailRef = useRef<string | null>(null);
  const partnerUserIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    partnerEmailRef.current = null;
    partnerUserIdRef.current = null;
    if (!leadId?.trim()) {
      setData(null);
      setLoading(false);
      setError('Не указан ID партнёра');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [leadRes, reportRes, onlineUsersRes] = await Promise.all([
        apiService.getLead(leadId),
        apiService.getLeadReport({ leadId, period }),
        apiService.getOnlineUsers(MAX_IDLE_MINUTES_ONLINE).catch(() => ({ success: false, data: { users: [] as { userId: string; email?: string; lastSeenAt: string }[] } })),
      ]);
      if (cancelledRef.current) return;

      if (!leadRes?.success || !leadRes?.data) {
        setData(null);
        setError('Партнёр не найден');
        setLoading(false);
        return;
      }

      const lead = leadRes.data;
      if (!reportRes?.success || !reportRes?.data) {
        setData(null);
        setError(reportRes?.message ?? 'Ошибка загрузки отчёта');
        setLoading(false);
        return;
      }

      const report = reportRes.data;
      const email = lead.email?.trim() || report.lead?.email?.trim();
      const leadUserId = typeof lead.assignedTo === 'string' ? lead.assignedTo : (lead as { assignedTo?: { _id?: string } }).assignedTo?._id;
      partnerEmailRef.current = email || null;
      partnerUserIdRef.current = leadUserId || null;

      const range = getPeriodDateRange(period);
      const rangeLabel = `${range.start.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric', year: 'numeric' })} - ${range.end.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      const periodLabel = PERIOD_LABELS[period] ?? PERIOD_LABELS.week;

      let isOnline = false;
      let lastSeenMinutesAgo: number | null = null;
      let onlineDaysLast7 = 0;
      let platformMinutesToday = 0;
      let crmMinutesToday = 0;

      const users = (onlineUsersRes as { success?: boolean; data?: { users: { userId: string; email?: string; lastSeenAt: string }[] } })?.data?.users ?? [];
      const matchByEmail = email ? users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) : null;
      // Для карточки партнёра используем только совпадение по email. assignedTo (leadUserId) часто = владелец лида (пригласивший), не реферал — иначе показывались бы ваши онлайновые данные.
      if (matchByEmail) {
        isOnline = true;
        lastSeenMinutesAgo = minutesSince(matchByEmail.lastSeenAt);
      }
      // «Онлайн за неделю» считаем только по партнёру, идентифицированному по email.
      // assignedTo (leadUserId) часто указывает на владельца лида (пригласившего), а не на реферала — тогда бы подставлялись ваши данные.
      if (matchByEmail) {
        try {
          const toDate = new Date();
          const fromDate = new Date(toDate);
          fromDate.setDate(fromDate.getDate() - 6);
          const statsRes = await apiService.getOnlineStats({
            from: formatDate(fromDate),
            to: formatDate(toDate),
            userId: matchByEmail.userId,
          });
          if (cancelledRef.current) return;
          if (statsRes?.success && statsRes.data?.stats) {
            for (const day of statsRes.data.stats) {
              if (day?.minutes > 0) onlineDaysLast7 += 1;
            }
            const todayKey = formatDate(new Date());
            const todayStat = statsRes.data.stats.find((d) => d?.date === todayKey);
            if (todayStat) {
              platformMinutesToday = todayStat.minutes ?? 0;
              crmMinutesToday = todayStat.minutes ?? 0;
            }
          }
        } catch {
          // ignore
        }
      }

      const stageCountsArr = stageCountsByProductToArray(report.stageCountsByProduct);
      const funnels = buildFunnelBoardsFromStageCounts(stageCountsArr);

      let level2Referrals = report.staticKpi?.level2Referrals ?? 0;
      if (level2Referrals === 0 && (report as { l1ReferralEmails?: string[] }).l1ReferralEmails?.length) {
        const emails = (report as { l1ReferralEmails: string[] }).l1ReferralEmails.filter(
          (e) => typeof e === 'string' && e.trim().includes('@')
        );
        if (emails.length > 0) {
          try {
            const counts = await Promise.all(emails.map((e) => apiService.getReferralsCountByEmail(e.trim())));
            if (!cancelledRef.current) {
              level2Referrals = counts.reduce(
                (sum, r) => sum + (r?.success && typeof r?.data?.totalCount === 'number' ? r.data.totalCount : 0),
                0
              );
            }
          } catch {
            // ignore
          }
        }
      }

      const person: PersonProfile = {
        id: lead._id,
        name: report.lead?.name?.trim() || lead.name?.trim() || '—',
        avatarUrl: DEFAULT_AVATAR,
        isOnline,
        lastSeenMinutesAgo,
        activityMarker: 'yellow',
        platformMinutesToday,
        crmMinutesToday,
        level2Count: level2Referrals,
        level1Count: report.staticKpi?.level1Referrals ?? 0,
        onlineDaysLast7,
      };

      const staticKpi: StaticKpi = {
        totalLeads: report.staticKpi?.totalLeads ?? 0,
        totalDeals: report.staticKpi?.totalDeals ?? 0,
        level1Referrals: report.staticKpi?.level1Referrals ?? 0,
        totalListings: report.staticKpi?.totalListings ?? 0,
      };

      const leadsTimeseries =
        report.leadsTimeseries?.length > 0
          ? fillLeadsTimeseriesForPeriod(
              report.leadsTimeseries.map((p) => ({ date: p.date, leads: p.leads ?? 0 })),
              period
            )
          : fillLeadsTimeseriesForPeriod([], period);

      const activityTimeseries: ActivityTimeseriesPoint[] =
        report.activityTimeseries?.length > 0
          ? report.activityTimeseries.map((p) => ({
              date: p.date,
              calls: p.calls ?? 0,
              chats: p.chats ?? 0,
              selections: 0,
            }))
          : leadsTimeseries.map((p) => ({
              date: p.date,
              calls: 0,
              chats: 0,
              selections: 0,
            }));

      const reportMonth = (report as { monthActivityTimeseries?: Array<{ date: string; calls: number; chats: number }> }).monthActivityTimeseries ?? [];
      const monthActivityTimeseries: ActivityTimeseriesPoint[] = reportMonth.map((p) => ({
        date: p.date,
        calls: p.calls ?? 0,
        chats: p.chats ?? 0,
        selections: 0,
      }));

      const reportAllTime = (report as { allTimeActivityTimeseries?: Array<{ date: string; calls: number; chats: number }> }).allTimeActivityTimeseries ?? [];
      const allTimeActivityTimeseries: ActivityTimeseriesPoint[] = reportAllTime.map((p) => ({
        date: p.date,
        calls: p.calls ?? 0,
        chats: p.chats ?? 0,
        selections: 0,
      }));

      const dynamicKpi: DynamicKpi = report.dynamicKpi
        ? {
            addedListings: report.dynamicKpi.addedListings ?? 0,
            addedLevel1Referrals: report.dynamicKpi.addedLevel1Referrals ?? 0,
            addedLevel2Referrals: report.dynamicKpi.addedLevel2Referrals ?? 0,
            addedLeads: report.dynamicKpi.addedLeads ?? 0,
            callClicks: report.dynamicKpi.callClicks ?? 0,
            chatOpens: report.dynamicKpi.chatOpens ?? 0,
            selectionsCreated: report.dynamicKpi.selectionsCreated ?? 0,
            deals: report.dynamicKpi.deals ?? 0,
          }
        : EMPTY_DYNAMIC_KPI;

      if (!cancelledRef.current) {
        setData({
          lead,
          person,
          periodLabel,
          range,
          rangeLabel,
          staticKpi,
          dynamicKpi,
          funnels,
          leadsTimeseries,
          activityTimeseries,
          monthActivityTimeseries: monthActivityTimeseries.length > 0 ? monthActivityTimeseries : undefined,
          allTimeActivityTimeseries: allTimeActivityTimeseries.length > 0 ? allTimeActivityTimeseries : undefined,
        });
      }
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setData(null);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [leadId, period]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  // Опрос онлайна в реальном времени для страницы партнёра (только по email партнёра, не по assignedTo)
  const ONLINE_POLL_MS = 20_000;
  useEffect(() => {
    if (!leadId) return;
    const fetchOnline = () => {
      const email = partnerEmailRef.current?.toLowerCase();
      if (!email) return;
      apiService.getOnlineUsers(MAX_IDLE_MINUTES_ONLINE).then((res) => {
        if (!res?.success || !res?.data?.users) return;
        const users = res.data.users;
        const match = users.find((u) => (u.email || '').toLowerCase() === email);
        setData((prev) => {
          if (!prev) return prev;
          if (match) {
            return {
              ...prev,
              person: {
                ...prev.person,
                isOnline: true,
                lastSeenMinutesAgo: minutesSince(match.lastSeenAt),
              },
            };
          }
          return { ...prev, person: { ...prev.person, isOnline: false } };
        });
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
  }, [leadId]);

  return { data, loading, error, refetch };
}
