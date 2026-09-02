import type { AxiosInstance } from 'axios';
import type { ApiResponse } from './types';
import { getAuthQuery } from './client';

export type LeadDistributionType = 'round_robin' | 'by_load' | 'manual';

export interface DistributionSettings {
  type: LeadDistributionType;
  manualDistributorId: string | null;
}

export type ApiContext = {
  api: AxiosInstance;
};

export function createSettingsMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();

  return {
    async getDistributionSettings(): Promise<ApiResponse<DistributionSettings>> {
      return api
        .get('/crm/settings/distribution', { params: auth() })
        .then((r) => r.data)
        .catch((err) => {
          if (err.response?.status === 404 || err.response?.status === 501) {
            // Fallback to localStorage if not implemented
            const local = localStorage.getItem('crm_distribution_settings');
            if (local) {
              return { success: true, data: JSON.parse(local) };
            }
          }
          throw err;
        });
    },

    async updateDistributionSettings(data: DistributionSettings): Promise<ApiResponse<DistributionSettings>> {
      // Always save to local storage as fallback
      localStorage.setItem('crm_distribution_settings', JSON.stringify(data));
      
      return api
        .post('/crm/settings/distribution', data, { params: auth() })
        .then((r) => r.data)
        .catch((err) => {
          if (err.response?.status === 404 || err.response?.status === 501) {
            return { success: true, data };
          }
          throw err;
        });
    },

    async bulkReassignLeads(fromManagerId: string, toManagerId: string): Promise<ApiResponse<{ updated: number }>> {
      return api
        .post('/crm/leads/bulk-assign', { fromManagerId, toManagerId }, { params: auth() })
        .then((r) => r.data)
        .catch((err) => {
          if (err.response?.status === 404 || err.response?.status === 501) {
            // No easy fallback for bulk assign on server side, 
            // but the frontend will update its local state anyway.
            return { success: true, data: { updated: 0 } };
          }
          throw err;
        });
    },
  };
}
