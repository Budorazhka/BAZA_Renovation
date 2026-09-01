import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../../services/api';
import type { AnalyticsPeriod, LeadsTimeseriesPoint } from '@/types/analytics';
import { getPeriodDateRange } from '../analyticsData';

export interface PersonLeadsStats {
  leadsCount: number;
  timeseries: LeadsTimeseriesPoint[];
}

const EMPTY_STATS: PersonLeadsStats = {
  leadsCount: 0,
  timeseries: [],
};

/** Строит таймсерию лидов по дате создания из списка лидов (fallback, если нет /crm/analytics/leads-stats) */
function buildTimeseriesFromLeads(
  items: Array<{ createdAt?: string }>,
  period: AnalyticsPeriod
): LeadsTimeseriesPoint[] {
  const range = getPeriodDateRange(period);
  const start = range.start.getTime();
  const end = range.end.getTime();
  const byDate: Record<string, number> = {};

  for (const item of items) {
    const raw = item.createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    const t = d.getTime();
    if (t < start || t > end) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDate[key] = (byDate[key] ?? 0) + 1;
  }

  const result: LeadsTimeseriesPoint[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const endDate = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
  while (cursor <= endDate) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    result.push({ date: key, leads: byDate[key] ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result.length > 0 ? result : [{ date: new Date().toISOString().slice(0, 10), leads: 0 }];
}

export function usePersonLeadsStats(period: AnalyticsPeriod): {
  stats: PersonLeadsStats;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [stats, setStats] = useState<PersonLeadsStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await apiService.getLeadsStats(period).catch(() => null);

      if (cancelledRef.current) return;

      const hasTimeseries = res?.success && res?.data && Array.isArray(res.data.timeseries) && res.data.timeseries.length > 0;
      if (hasTimeseries) {
        const ts: LeadsTimeseriesPoint[] = (res!.data!.timeseries ?? []).map((p) => ({
          date: p.date,
          leads: p.leads ?? 0,
        }));
        setStats({
          leadsCount: res!.data!.leadsCount ?? ts.reduce((s, p) => s + (p.leads ?? 0), 0),
          timeseries: ts,
        });
        return;
      }

      const leadsCountFromApi = res?.success && res?.data ? (res.data.leadsCount ?? 0) : 0;

      const leadsRes = await apiService.getLeads({ limit: 2000, page: 1 });
      if (cancelledRef.current) return;

      if (leadsRes.success && leadsRes.data?.items) {
        const items = leadsRes.data.items;
        const timeseries = buildTimeseriesFromLeads(items, period);
        const totalInPeriod = timeseries.reduce((s, p) => s + (p.leads ?? 0), 0);
        setStats({
          leadsCount: totalInPeriod > 0 ? totalInPeriod : leadsCountFromApi,
          timeseries,
        });
      } else {
        setStats({
          leadsCount: leadsCountFromApi,
          timeseries: leadsCountFromApi > 0 ? buildTimeseriesFromLeads([], period) : [],
        });
      }
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки лидов');
        setStats(EMPTY_STATS);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [period]);

  const refetch = useCallback(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    cancelledRef.current = false;
    load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  return { stats, loading, error, refetch };
}
