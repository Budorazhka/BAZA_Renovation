import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService, ProductType } from '../../../services/api';
import type { FunnelBoard } from '@/types/analytics';
import { buildFunnelBoardsFromStageCounts } from '../funnelTemplates';

const EMPTY_FUNNELS: FunnelBoard[] = [];

function normalizeStageKey(s: string): string {
  return s.toLowerCase().trim();
}

/** Загружает этапы по всем категориям (продажи, сеть, собственник, партнёры) и объединяет в один список для канбана */
async function loadAllStagesMerged(): Promise<Array<{ stage: string; count: number }>> {
  const productTypes = [
    ProductType.SALES,
    ProductType.NETWORK,
    ProductType.OWNER,
    ProductType.AGENT,
  ];
  const results = await Promise.allSettled(
    productTypes.map((pt) => apiService.getLeadsByStage(pt))
  );

  const byStage: Record<string, number> = {};
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const res = result.value;
    if (!res?.success || typeof res.data !== 'object' || res.data === null) continue;
    for (const [stage, count] of Object.entries(res.data)) {
      if (typeof count !== 'number') continue;
      const key = normalizeStageKey(stage);
      byStage[key] = (byStage[key] ?? 0) + count;
    }
  }

  return Object.entries(byStage).map(([stage, count]) => ({ stage, count }));
}

export function useFunnelsBackend(): {
  funnels: FunnelBoard[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [funnels, setFunnels] = useState<FunnelBoard[]>(EMPTY_FUNNELS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const stageCounts = await loadAllStagesMerged();

      if (cancelledRef.current) return;

      setFunnels(buildFunnelBoardsFromStageCounts(stageCounts));
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки воронок');
        setFunnels(EMPTY_FUNNELS);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => load(false), [load]);

  useEffect(() => {
    cancelledRef.current = false;
    load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  return { funnels, loading, error, refetch };
}
