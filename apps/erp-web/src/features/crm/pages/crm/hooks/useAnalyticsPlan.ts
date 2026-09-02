import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../../services/api';
import type { PlanTargetsByBucketExport } from '@/components/analytics-network/personal-analytics-insights';

export type PlanTargets = PlanTargetsByBucketExport;

const DEFAULT_PLAN: PlanTargets = {
  week: { leads: 15, contacts: 45, deals: 3 },
  month: { leads: 60, contacts: 180, deals: 12 },
};

export function useAnalyticsPlan(): {
  loadPlan: () => Promise<PlanTargets | null>;
  savePlan: (targets: PlanTargets) => Promise<void>;
  error: string | null;
  loading: boolean;
} {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const loadPlan = useCallback(async (): Promise<PlanTargets | null> => {
    setError(null);
    try {
      const res = await apiService.getAnalyticsPlan();
      if (cancelledRef.current) return null;
      if (!res.success) return null;
      const data = res.data;
      if (!data || typeof data !== 'object') return null;
      const week = data.week && typeof data.week === 'object'
        ? {
            leads: Number(data.week.leads) || 0,
            contacts: Number(data.week.contacts) || 0,
            deals: Number(data.week.deals) || 0,
          }
        : DEFAULT_PLAN.week;
      const month = data.month && typeof data.month === 'object'
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
  }, []);

  const savePlan = useCallback(async (targets: PlanTargets): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      await apiService.saveAnalyticsPlan({
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
      });
      if (cancelledRef.current) return;
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Ошибка сохранения плана');
        throw e;
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return { loadPlan, savePlan, error, loading };
}
