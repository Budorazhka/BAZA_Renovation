/**
 * Данные для страницы «Аналитика меня» — один источник: GET /crm/analytics/lead-report без leadId/email.
 * Бэкенд возвращает отчёт по текущему пользователю (JWT). Так же считаются данные при просмотре этого пользователя как партнёра.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '@/features/crm/services/api';
import type { AnalyticsPeriod, PersonAnalyticsData } from '@/types/analytics';
import type { ActivityTimeseriesPoint } from '@/types/analytics';
import { fillLeadsTimeseriesForPeriod, getPeriodDateRange } from '../analyticsData';
import { buildFunnelBoardsFromStageCounts, stageCountsByProductToArray } from '../funnelTemplates';

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  week: 'Эта неделя',
  month: 'Этот месяц',
  allTime: 'За всё время',
};

function toActivityPoint(p: { date: string; calls: number; chats: number }): ActivityTimeseriesPoint {
  return { date: p.date, calls: p.calls ?? 0, chats: p.chats ?? 0, selections: 0 };
}

export function useMeAnalyticsData(period: AnalyticsPeriod): {
  data: PersonAnalyticsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<PersonAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getLeadReport({ period });
      if (cancelledRef.current) return;
      if (!res?.success || !res?.data) {
        setError(res?.message ?? 'Ошибка загрузки');
        setData(null);
        setLoading(false);
        return;
      }
      const report = res.data;
      const range = getPeriodDateRange(period);
      const periodLabel = PERIOD_LABELS[period] ?? PERIOD_LABELS.week;

      const leadsTimeseries =
        report.leadsTimeseries?.length > 0
          ? fillLeadsTimeseriesForPeriod(
              report.leadsTimeseries.map((p) => ({ date: p.date, leads: p.leads ?? 0 })),
              period
            )
          : fillLeadsTimeseriesForPeriod([], period);

      const activityTimeseries =
        report.activityTimeseries?.length > 0
          ? report.activityTimeseries.map(toActivityPoint)
          : [{ date: range.start.toISOString().slice(0, 10), calls: 0, chats: 0, selections: 0 }];

      const monthActivityTimeseries =
        (report.monthActivityTimeseries?.length ?? 0) > 0
          ? report.monthActivityTimeseries!.map(toActivityPoint)
          : [];

      const allTimeActivityTimeseries =
        (report.allTimeActivityTimeseries?.length ?? 0) > 0
          ? report.allTimeActivityTimeseries!.map(toActivityPoint)
          : [{ date: range.start.toISOString().slice(0, 10), calls: 0, chats: 0, selections: 0 }];

      const stageCountsArr = stageCountsByProductToArray(report.stageCountsByProduct);
      const funnels = buildFunnelBoardsFromStageCounts(stageCountsArr);

      const personData: PersonAnalyticsData = {
        period,
        periodLabel,
        person: {
          id: 'me',
          name: report.lead?.name?.trim() || 'Вы',
          avatarUrl: '',
          isOnline: false,
          lastSeenMinutesAgo: null,
          activityMarker: 'yellow',
          platformMinutesToday: 0,
          crmMinutesToday: 0,
          level2Count: report.staticKpi?.level2Referrals ?? 0,
          level1Count: report.staticKpi?.level1Referrals ?? 0,
          onlineDaysLast7: 0,
        },
        staticKpi: {
          totalLeads: report.staticKpi?.totalLeads ?? 0,
          totalDeals: report.staticKpi?.totalDeals ?? 0,
          level1Referrals: report.staticKpi?.level1Referrals ?? 0,
          totalListings: report.staticKpi?.totalListings ?? 0,
        },
        dynamicKpi: {
          addedListings: report.dynamicKpi?.addedListings ?? 0,
          addedLevel1Referrals: report.dynamicKpi?.addedLevel1Referrals ?? 0,
          addedLevel2Referrals: report.dynamicKpi?.addedLevel2Referrals ?? 0,
          addedLeads: report.dynamicKpi?.addedLeads ?? 0,
          callClicks: report.dynamicKpi?.callClicks ?? 0,
          chatOpens: report.dynamicKpi?.chatOpens ?? 0,
          selectionsCreated: report.dynamicKpi?.selectionsCreated ?? 0,
          deals: report.dynamicKpi?.deals ?? 0,
        },
        leadsTimeseries,
        activityTimeseries,
        monthActivityTimeseries: monthActivityTimeseries.length > 0 ? monthActivityTimeseries : undefined,
        allTimeActivityTimeseries: allTimeActivityTimeseries.length > 0 ? allTimeActivityTimeseries : undefined,
        funnels,
        referrals: [],
        maxLeadsAdded: 1,
        maxStageChangesCount: 1,
      };
      setData(personData);
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setData(null);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [period]);

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

  return { data: loading && !data ? null : data, loading, error, refetch };
}
