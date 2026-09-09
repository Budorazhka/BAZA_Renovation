import axios from 'axios';
import { PLATFORM_API_BASE_URL } from '@/config/backend';
import type {
  LeadFunnelReportResponse,
  PositionsReportResponse,
  TeamPerformanceReportResponse,
} from '@/types/crmReports';

export * from '@/types/crmReports';

const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const crmReportsApi = {
  /** GET /api/v1/crm/reports/lead-funnel */
  async getLeadFunnel(params?: {
    productType?: string;
    from?: string;
    to?: string;
  }): Promise<LeadFunnelReportResponse> {
    const { data } = await api.get<LeadFunnelReportResponse>('/api/v1/crm/reports/lead-funnel', {
      params,
    });
    return data;
  },

  /** GET /api/v1/crm/reports/positions */
  async getPositions(params?: { from?: string; to?: string }): Promise<PositionsReportResponse> {
    const { data } = await api.get<PositionsReportResponse>('/api/v1/crm/reports/positions', {
      params,
    });
    return data;
  },

  /** GET /api/v1/crm/reports/team-performance */
  async getTeamPerformance(params?: {
    from?: string;
    to?: string;
    positionId?: string;
  }): Promise<TeamPerformanceReportResponse> {
    const { data } = await api.get<TeamPerformanceReportResponse>(
      '/api/v1/crm/reports/team-performance',
      { params },
    );
    return data;
  },
};
