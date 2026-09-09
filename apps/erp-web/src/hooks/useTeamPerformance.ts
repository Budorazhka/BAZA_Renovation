import { useCallback, useEffect, useState } from 'react';
import { crmReportsApi, type TeamPerformanceReportResponse } from '@/services/crmReportsApi';
import type {
  ActivityTimeseriesPoint,
  AnalyticsPeriod,
  DynamicKpi,
  FunnelBoard,
  PartnerRow,
  StaticKpi,
} from '@/types/analytics';
import type { ManagerAnalyticsData, TeamBranchFilter } from '@/lib/bi/manager-analytics-adapter';

function getPeriodDates(period: AnalyticsPeriod): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString();
  let fromDate = new Date();

  switch (period) {
    case 'week':
      fromDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      fromDate.setMonth(now.getMonth() - 1);
      break;
    case 'allTime':
      fromDate.setFullYear(now.getFullYear() - 2);
      break;
    default:
      fromDate.setMonth(now.getMonth() - 1);
  }

  return { from: fromDate.toISOString(), to };
}

export function useTeamPerformance(
  period: AnalyticsPeriod = 'month',
  branchFilter: TeamBranchFilter = 'all',
  positionId?: string,
) {
  const [data, setData] = useState<ManagerAnalyticsData | null>(null);
  const [rawReport, setRawReport] = useState<TeamPerformanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { from, to } = getPeriodDates(period);
      const report = await crmReportsApi.getTeamPerformance({
        from,
        to,
        positionId: positionId && positionId !== 'all' ? positionId : undefined,
      });
      setRawReport(report);

      // Маппинг данных из Platform API в структуры UI
      const revenueMinorUnits = report.summary.dealsCommission.reduce(
        (acc, cur) => acc + cur.amountMinorUnits,
        0,
      );
      const revenueMillions = Math.round((revenueMinorUnits / 100_000_000) * 10) / 10;

      const dynamicKpi: DynamicKpi = {
        addedListings: report.summary.dealsTotal,
        addedLevel1Referrals: 0,
        addedLevel2Referrals: 0,
        addedLeads: report.summary.leadsTotal,
        callClicks: report.summary.tasksCompleted,
        chatOpens: report.summary.tasksTotal,
        selectionsCreated: report.summary.leadsConverted,
        deals: report.summary.dealsWon,
      };

      const staticKpi: StaticKpi = {
        level1Referrals: report.positions.length,
        totalListings: report.summary.dealsTotal,
        totalLeads: report.summary.leadsTotal,
        totalDeals: report.summary.dealsWon,
      };

      const leadsTimeseries = report.timeseries.map((t) => ({
        date: t.date,
        leads: t.leads,
      }));

      const activityTimeseries: ActivityTimeseriesPoint[] = report.timeseries.map((t) => ({
        date: t.date,
        calls: t.completedTasks,
        chats: t.deals,
        selections: t.leads,
      }));

      const managers: PartnerRow[] = report.positions.map((pos, idx) => {
        const commMinor = pos.dealsCommission.reduce((acc, c) => acc + c.amountMinorUnits, 0);
        const commUsd = Math.round((commMinor / 100) * 10) / 10;
        const posName = pos.positionId ? `Менеджер #${pos.positionId.slice(-4)}` : 'Общий пул';
        const marker: 'green' | 'yellow' | 'red' =
          pos.slaPercent >= 70 ? 'green' : pos.slaPercent >= 40 ? 'yellow' : 'red';

        return {
          id: pos.positionId ?? `unassigned-${idx}`,
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(posName)}&background=14532d&color=ffffff&size=128&bold=true&format=svg`,
          name: posName,
          isOnline: true,
          lastSeenMinutesAgo: 5,
          onlineDaysLast7: 5,
          onlineWeekMarkers: [marker, marker, marker, marker, marker, 'green', 'green'],
          platformMinutesToday: 120,
          crmMinutesToday: 90,
          branch: branchFilter,
          role: 'manager',
          planPercent: pos.conversionRatePercent,
          commissionUsd: commUsd,
          leadsAdded: pos.leadsAdded,
          stageChangesCount: pos.leadsConverted + pos.dealsWon,
          level1Count: 0,
          level2Count: pos.dealsTotal,
          callClicks: pos.tasksCompleted,
          chatOpens: pos.tasksTotal,
          selectionsCreated: pos.leadsConverted,
          activityTotal: pos.tasksCompleted + pos.leadsConverted + pos.dealsWon,
          activityMarker: marker,
        };
      });

      const maxLeads = Math.max(...managers.map((m) => m.leadsAdded), 1);
      const maxStageChanges = Math.max(...managers.map((m) => m.stageChangesCount), 1);

      const funnels: FunnelBoard[] = [
        {
          id: 'sales',
          name: 'Воронка продаж',
          shortName: 'Продажи',
          totalCount: report.summary.leadsTotal,
          activeCount: report.summary.leadsTotal - report.summary.leadsConverted,
          rejectionCount: 0,
          closedCount: report.summary.leadsConverted,
          columns: [
            {
              id: 'new',
              name: 'Новые',
              count: report.summary.leadsTotal - report.summary.leadsConverted,
              stages: [
                {
                  id: 'new_lead',
                  name: 'Входящие лиды',
                  order: 1,
                  count: report.summary.leadsTotal - report.summary.leadsConverted,
                },
              ],
            },
            {
              id: 'success',
              name: 'Успешно',
              count: report.summary.leadsConverted,
              stages: [
                {
                  id: 'converted',
                  name: 'Конвертировано',
                  order: 2,
                  count: report.summary.leadsConverted,
                },
              ],
            },
          ],
        },
      ];


      const periodLabels: Record<AnalyticsPeriod, string> = {
        week: 'За 7 дней',
        month: 'За 30 дней',
        allTime: 'За всё время',
      };

      const branchLabels: Record<TeamBranchFilter, string> = {
        all: 'Вся команда',
        msk: 'Москва и МО',
        spb: 'Санкт-Петербург',
      };

      setData({
        period,
        periodLabel: periodLabels[period],
        branchLabel: branchLabels[branchFilter],
        staticKpi,
        dynamicKpi,
        leadsTimeseries,
        activityTimeseries,
        funnels,
        managers,
        maxLeadsAdded: maxLeads,
        maxStageChangesCount: maxStageChanges,
        summary: {
          managersCount: managers.length,
          activeManagersCount: managers.filter((m) => m.activityMarker === 'green').length,
          riskManagersCount: managers.filter((m) => m.activityMarker === 'red').length,
          avgOnlineDaysLast7: 5,
          avgPlanPercent: report.summary.conversionRatePercent,
          revenueMillions,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить отчёт по команде';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [period, branchFilter, positionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await fetchReport();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchReport]);

  return { data, rawReport, loading, error, refetch: fetchReport };
}
