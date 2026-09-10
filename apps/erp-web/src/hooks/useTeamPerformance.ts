import { useCallback, useEffect, useState } from 'react';
import { crmReportsApi, type MoneyAmountSum, type TeamPerformanceReportResponse } from '@/services/crmReportsApi';
import { teamApi } from '@/services/teamApi';
import type { TeamUser } from '@/types/team';
import type {
  ActivityMarker,
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

/** Позиции в Mongo — 24-символьный hex ObjectId. Мок-id вида 'emp-rop-msk'
 * (personnel-mock/MOCK_EMPLOYEES) под это не подходят — бэкенд не может их
 * распарсить и падает 500-й. */
const MONGO_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Складывает amountMinorUnits только если все записи в одной валюте — суммы в
 * разных валютах нельзя складывать без конвертации, это не "нечестно", а
 * математически неверно. При смешанных валютах агрегат не считаем (0, currency
 * null) вместо того, чтобы подписать сумму валют одним произвольным кодом.
 */
function sumMinorUnitsIfSingleCurrency(entries: MoneyAmountSum[]): { millions: number; currency: string | null } {
  if (entries.length === 0) return { millions: 0, currency: null };
  const currencies = new Set(entries.map((e) => e.currency));
  if (currencies.size > 1) return { millions: 0, currency: null };
  const totalMinor = entries.reduce((acc, e) => acc + e.amountMinorUnits, 0);
  return { millions: Math.round((totalMinor / 100_000_000) * 10) / 10, currency: entries[0].currency };
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

      if (positionId && !MONGO_OBJECT_ID_RE.test(positionId)) {
        // Список сотрудников для фильтра отчёта должен приходить из
        // team-users API (teamApi.list(), см. ниже), не из мок-данных вроде
        // MOCK_EMPLOYEES — их id backend принять не может.
        throw new Error('Некорректный идентификатор сотрудника — выберите сотрудника из списка команды');
      }

      const { from, to } = getPeriodDates(period);
      const [report, teamUsers] = await Promise.all([
        crmReportsApi.getTeamPerformance({ from, to, positionId }),
        // Реальный список сотрудников организации (то же API, что и реестр
        // команды) — только для честных имён/аватаров вместо "Менеджер #xxxx"
        // и заглушек ui-avatars.com. Недоступность не должна валить отчёт.
        teamApi.list().catch(() => [] as TeamUser[]),
      ]);
      setRawReport(report);
      const teamUserByPositionId = new Map(teamUsers.map((u) => [u.id, u] as const));

      // Маппинг данных из Platform API в структуры UI
      const { millions: revenueMillions } = sumMinorUnitsIfSingleCurrency(report.summary.dealsCommission);

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
        // Карточка подписана "Активные задачи" (TeamReportPage.tsx) — честно
        // считаем незавершённые задачи, а не dealsTotal (раньше тут были
        // сделки под подписью "задачи").
        totalListings: Math.max(0, report.summary.tasksTotal - report.summary.tasksCompleted),
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
        const teamUser = pos.positionId ? teamUserByPositionId.get(pos.positionId) : undefined;
        const posName = teamUser?.name ?? (pos.positionId ? `Менеджер #${pos.positionId.slice(-4)}` : 'Общий пул');
        const { millions: commUsd } = sumMinorUnitsIfSingleCurrency(pos.dealsCommission);
        const marker: 'green' | 'yellow' | 'red' =
          pos.slaPercent >= 70 ? 'green' : pos.slaPercent >= 40 ? 'yellow' : 'red';

        return {
          id: pos.positionId ?? `unassigned-${idx}`,
          // Реальный аватар позиции, если загружен, иначе пусто — без
          // заглушек с ui-avatars.com (ParticipantCell сама покажет инициалы).
          avatarUrl: teamUser?.avatarUrl ?? '',
          name: posName,
          // Backend не отдаёт присутствие/онлайн-телеметрию для отчёта —
          // раньше здесь были константы (isOnline: true, "5 минут",
          // 120/90 минут, "5 из 7 дней"). Честных данных для этих полей нет,
          // PartnerRow/ParticipantCell не поддерживают состояние "нет данных",
          // поэтому используем нейтральные значения, а не выдумываем цифры.
          isOnline: false,
          lastSeenMinutesAgo: null,
          onlineDaysLast7: 0,
          onlineWeekMarkers: Array(7).fill(marker) as ActivityMarker[],
          platformMinutesToday: 0,
          crmMinutesToday: 0,
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
          // Нет присутствие-телеметрии с бэкенда (см. managers[].onlineDaysLast7
          // выше) — честно 0, а не выдуманная константа "5 из 7".
          avgOnlineDaysLast7: 0,
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
