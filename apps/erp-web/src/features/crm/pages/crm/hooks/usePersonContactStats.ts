import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../../services/api';
import type { AnalyticsPeriod, ActivityTimeseriesPoint } from '@/types/analytics';

export interface PersonContactStats {
  callsCount: number;
  chatsCount: number;
  timeseries: ActivityTimeseriesPoint[];
}

const EMPTY_STATS: PersonContactStats = {
  callsCount: 0,
  chatsCount: 0,
  timeseries: [],
};

export function usePersonContactStats(period: AnalyticsPeriod): {
  stats: PersonContactStats;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [stats, setStats] = useState<PersonContactStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await apiService.getContactActionsStats(period);

      if (cancelledRef.current) return;

      if (res.success && res.data) {
        const ts: ActivityTimeseriesPoint[] = (res.data.timeseries ?? []).map((p) => ({
          date: p.date,
          calls: p.calls ?? 0,
          chats: p.chats ?? 0,
          selections: 0,
        }));
        setStats({
          callsCount: res.data.callsCount ?? 0,
          chatsCount: res.data.chatsCount ?? 0,
          timeseries: ts,
        });
      } else {
        setStats(EMPTY_STATS);
      }
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки контактов');
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
