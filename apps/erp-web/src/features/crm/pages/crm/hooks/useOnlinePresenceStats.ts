import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../../services/api';
import { getPeriodDateRange } from '../analyticsData';
import type { ActivityTimeseriesPoint } from '@/types/analytics';
import { getAuthQuery } from '../../../services/api/client';

export interface OnlinePresenceStats {
  /** Карта дата (YYYY-MM-DD) -> минут в сети за день */
  byDate: Record<string, number>;
  /** Количество дней за последние 7 календарных дней, когда пользователь был в сети (minutes > 0) */
  onlineDaysLast7: number;
  /** Таймсерия по дням текущего месяца: minutes кладём в поле calls, остальные поля = 0 */
  monthTimeseries: ActivityTimeseriesPoint[];
  /** Текущий статус онлайн по данным /crm/online/users */
  isOnline: boolean | null;
}

const EMPTY_STATS: OnlinePresenceStats = {
  byDate: {},
  onlineDaysLast7: 0,
  monthTimeseries: [],
  isOnline: null,
};

const REFETCH_INTERVAL_MS = 25_000;

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function eachDay(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function useOnlinePresenceStats(): {
  stats: OnlinePresenceStats;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [stats, setStats] = useState<OnlinePresenceStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const { start: monthStart, end: monthEnd } = getPeriodDateRange('month');

        // Для корректного подсчёта последних 7 дней расширяем период статистики
        const statsFrom = new Date(monthStart);
        statsFrom.setDate(statsFrom.getDate() - 6);
        const statsTo = new Date(monthEnd);

        const fromStr = formatDate(statsFrom);
        const toStr = formatDate(statsTo);

        const { userId } = getAuthQuery();

        const [statsRes, onlineUsersRes] = await Promise.all([
          apiService.getOnlineStats({ from: fromStr, to: toStr }),
          apiService.getOnlineUsers().catch(() => null),
        ]);

        if (cancelledRef.current) return;

        const byDate: Record<string, number> = {};
        if (statsRes.success && statsRes.data?.stats) {
          for (const day of statsRes.data.stats) {
            if (!day?.date) continue;
            const key = day.date;
            const minutes = typeof day.minutes === 'number' && !Number.isNaN(day.minutes) ? day.minutes : 0;
            byDate[key] = (byDate[key] ?? 0) + Math.max(0, minutes);
          }
        }

        // Считаем онлайн-дни за последние 7 календарных дней от сегодняшней даты
        const now = new Date();
        const last7End = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const last7Start = new Date(last7End);
        last7Start.setDate(last7End.getDate() - 6);

        let onlineDaysLast7 = 0;
        for (const date of eachDay(last7Start, last7End)) {
          const key = formatDate(date);
          if ((byDate[key] ?? 0) > 0) {
            onlineDaysLast7 += 1;
          }
        }

        // Готовим таймсерию по текущему месяцу для календаря:
        // minutes кладём в поле calls, остальные = 0
        const monthDates = eachDay(monthStart, monthEnd);
        const monthTimeseries: ActivityTimeseriesPoint[] = monthDates.map((date) => {
          const key = formatDate(date);
          const minutes = byDate[key] ?? 0;
          return {
            date: date.toISOString(),
            calls: minutes,
            chats: 0,
            selections: 0,
          };
        });

        // Определяем онлайн-статус пользователя по /crm/online/users
        let isOnline: boolean | null = null;
        if (onlineUsersRes && onlineUsersRes.success && onlineUsersRes.data?.users && userId) {
          isOnline = onlineUsersRes.data.users.some((u) => u.userId === userId);
        }

        setStats({
          byDate,
          onlineDaysLast7,
          monthTimeseries,
          isOnline,
        });
      } catch (e: unknown) {
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки статистики онлайн-присутствия');
          setStats(EMPTY_STATS);
        }
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const refetch = useCallback(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    cancelledRef.current = false;
    load(false);

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load(true);
      }
    }, REFETCH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        load(true);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [load]);

  return { stats, loading, error, refetch };
}

