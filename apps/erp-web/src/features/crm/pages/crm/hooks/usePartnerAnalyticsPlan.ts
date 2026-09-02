/**
 * Загрузка и сохранение плана партнёра для блока «План/факт» в карточке партнёра.
 * Использует GET/PUT /crm/analytics/plan?leadId=...
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '@/features/crm/services/api';
import type { PlanTargetsByBucketExport } from '@/components/analytics-network/personal-analytics-insights';

const DEFAULT_PLAN: PlanTargetsByBucketExport = {
  week: { leads: 0, contacts: 0, deals: 0 },
  month: { leads: 0, contacts: 0, deals: 0 },
};

export function usePartnerAnalyticsPlan(leadId: string | undefined): {
  loadPlan: () => Promise<PlanTargetsByBucketExport | null>;
  savePlan: (targets: PlanTargetsByBucketExport) => Promise<void>;
  error: string | null;
  loading: boolean;
} {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const loadPlan = useCallback(async (): Promise<PlanTargetsByBucketExport | null> => {
    if (!leadId?.trim()) return null;
    setError(null);
    try {
      const res = await apiService.getAnalyticsPlan({ leadId });
      if (cancelledRef.current) return null;
      if (!res.success) return null;
      const data = res.data;
      if (!data || typeof data !== 'object') return null;
      const week =
        data.week && typeof data.week === 'object'
          ? {
              leads: Number(data.week.leads) || 0,
              contacts: Number(data.week.contacts) || 0,
              deals: Number(data.week.deals) || 0,
            }
          : DEFAULT_PLAN.week;
      const month =
        data.month && typeof data.month === 'object'
          ? {
              leads: Number(data.month.leads) || 0,
              contacts: Number(data.month.contacts) || 0,
              deals: Number(data.month.deals) || 0,
            }
          : DEFAULT_PLAN.month;
      return { week, month };
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки плана');
      }
      return null;
    }
  }, [leadId]);

  const savePlan = useCallback(
    async (targets: PlanTargetsByBucketExport): Promise<void> => {
      if (!leadId?.trim()) return;
      setError(null);
      setLoading(true);
      try {
        await apiService.saveAnalyticsPlan(
          {
            week: {
              leads: Math.max(0, Math.round(targets.week.leads)),
              contacts: Math.max(0, Math.round(targets.week.contacts)),
              deals: Math.max(0, Math.round(targets.week.deals)),
            },
            month: {
              leads: Math.max(0, Math.round(targets.month.leads)),
              contacts: Math.max(0, Math.round(targets.month.contacts)),
              deals: Math.max(0, Math.round(targets.month.deals)),
            },
          },
          { leadId }
        );
        if (cancelledRef.current) return;
      } catch (e) {
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : 'Ошибка сохранения плана');
          throw e;
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [leadId]
  );

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return { loadPlan, savePlan, error, loading };
}
