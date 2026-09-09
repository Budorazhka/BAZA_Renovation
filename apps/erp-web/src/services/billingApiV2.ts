import axios from 'axios';
import { PLATFORM_API_BASE_URL } from '@/config/backend';
import type {
  BillingLedgerEntry,
  OrganizationSubscriptionOverview,
  SubscriptionPlan,
} from '@/types/billingV2';

export * from '@/types/billingV2';

const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const billingApiV2 = {
  /** GET /api/v1/billing/subscription */
  async getSubscription(): Promise<OrganizationSubscriptionOverview> {
    const { data } = await api.get<OrganizationSubscriptionOverview>('/api/v1/billing/subscription');
    return data;
  },

  /** GET /api/v1/billing/plans */
  async listPlans(audience?: 'developer' | 'agency' | 'independent_realtor'): Promise<SubscriptionPlan[]> {
    const { data } = await api.get<SubscriptionPlan[]>('/api/v1/billing/plans', {
      params: audience ? { audience } : undefined,
    });
    return data;
  },

  /** GET /api/v1/billing/ledger */
  async getLedger(): Promise<BillingLedgerEntry[]> {
    const { data } = await api.get<BillingLedgerEntry[]>('/api/v1/billing/ledger');
    return data;
  },
};
