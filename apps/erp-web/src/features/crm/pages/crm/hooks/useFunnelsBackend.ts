import { useCallback, useEffect, useRef, useState } from 'react';
import { crmReportApiV2 } from '@/services/crmReportApiV2';
import type { CrmReportProductType } from '@/types/crmReportV2';
import type { FunnelBoard } from '@/types/analytics';
import { buildFunnelBoardsFromStageCounts, STAGE_NAME_TO_LEAD_STAGE_V2 } from '../funnelTemplates';

const EMPTY_FUNNELS: FunnelBoard[] = [];

function normalizeStageKey(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Загружает воронку лидов по всем 4 продуктам (продажи, сеть, собственник,
 * партнёры) с РЕАЛЬНОГО backend (GET /crm/reports/lead-funnel по истории
 * lead_events, см. её докстринг) и объединяет в один список для канбана —
 * тот же merge-паттерн, что и раньше на легаси `getLeadsByStage`, только
 * источник данных теперь событийная история, не текущий снимок.
 */
async function loadAllStagesMerged(): Promise<Array<{ stage: string; count: number }>> {
  const productTypes: CrmReportProductType[] = ['sales', 'network', 'owner', 'agent'];
  const results = await Promise.allSettled(
    productTypes.map((productType) => crmReportApiV2.getLeadFunnel({ productType }))
  );

  const byStage: Record<string, number> = {};
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const { stage, leadCount } of result.value.stages) {
      const key = normalizeStageKey(stage);
      byStage[key] = (byStage[key] ?? 0) + leadCount;
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

      setFunnels(buildFunnelBoardsFromStageCounts(stageCounts, STAGE_NAME_TO_LEAD_STAGE_V2));
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
