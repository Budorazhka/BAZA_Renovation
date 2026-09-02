import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  CreateLeadDto,
  CreateNotificationDto,
  Lead,
  Notification,
} from './types';
import { getAdminHeaders } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createAdminMethods(ctx: ApiContext) {
  const { api } = ctx;
  const getAdminH = () => getAdminHeaders(api);

  return {
    adminLogin(
      token: string
    ): Promise<ApiResponse<{ message?: string; token?: string }>> {
      return api.post('/admin/login', undefined, { params: { token } }).then((r) => r.data);
    },
    adminCreateNotification(
      data: CreateNotificationDto,
      createdBy?: string
    ): Promise<ApiResponse<Notification>> {
      return api
        .post('/admin/notifications/create', data, {
          headers: getAdminH(),
          params: createdBy ? { createdBy } : {},
        })
        .then((r) => r.data);
    },
    adminCreateNews(
      body: { title: string; message: string }
    ): Promise<ApiResponse<{ created: number; items: Notification[] }>> {
      return api
        .post('/admin/notifications/news', body, { headers: getAdminH() })
        .then((r) => r.data);
    },
    adminSendDailyTaskNotification(): Promise<
      ApiResponse<{ message: string; notification: Notification | null }>
    > {
      return api
        .post('/admin/notifications/send-daily-task', undefined, {
          headers: getAdminH(),
        })
        .then((r) => r.data);
    },
    adminCreateLeadManual(
      data: CreateLeadDto,
      forAll?: boolean
    ): Promise<ApiResponse<Lead | { created: number; items: Lead[] }>> {
      const cleanData: any = {
        name: String(data.name || '').trim(),
        phone: String(data.phone || '').trim(),
        productType: data.productType,
        assignedTo: String(data.assignedTo || '').trim(),
      };
      if (data.email) cleanData.email = String(data.email).trim();
      if (data.city) cleanData.city = String(data.city).trim();
      if (data.source) cleanData.source = String(data.source).trim();
      if (data.notes) cleanData.notes = String(data.notes).trim();
      if (data.dealValue != null) cleanData.dealValue = Number(data.dealValue);
      if (data.expectedCloseDate)
        cleanData.expectedCloseDate = String(data.expectedCloseDate).trim();
      const allowedFields = [
        'name',
        'phone',
        'email',
        'city',
        'productType',
        'assignedTo',
        'source',
        'notes',
        'dealValue',
        'expectedCloseDate',
      ];
      const sanitizedData: any = {};
      for (const k of allowedFields) {
        if (k in cleanData) sanitizedData[k] = cleanData[k];
      }
      const requestBody = {
        mode: 'manual' as const,
        data: sanitizedData,
        ...(forAll ? { forAll: true } : {}),
      };
      return api
        .post('/admin/leads/create', requestBody, { headers: getAdminH() })
        .then((r) => r.data);
    },
    adminUpdateUserRole(
      email: string,
      role: string
    ): Promise<
      ApiResponse<{
        email: string;
        oldRole: string;
        newRole: string;
        name: string;
        message: string;
      }>
    > {
      return api
        .patch('/admin/users/role', { email, role }, { headers: getAdminH() })
        .then((r) => r.data);
    },
    adminUpdateUsersRoles(
      updates: Array<{ email: string; role: string }>
    ): Promise<
      ApiResponse<{
        updated: number;
        total: number;
        results: Array<{
          email: string;
          oldRole: string;
          newRole: string;
          name: string;
          success: boolean;
        }>;
        errors: string[];
      }>
    > {
      return api
        .patch('/admin/users/roles/batch', { updates }, { headers: getAdminH() })
        .then((r) => r.data);
    },
    adminGetUserInfo(
      email: string
    ): Promise<
      ApiResponse<{
        _id: string;
        email: string;
        name: string;
        role: string;
        phone?: string;
        avatar?: string;
        isActive?: boolean;
        lastLogin?: string;
        createdAt?: string;
        updatedAt?: string;
      }>
    > {
      return api
        .post('/admin/users/info', { email }, { headers: getAdminH() })
        .then((r) => r.data);
    },
    adminAutoCreateLeads(
      opts: { forAll?: boolean; assignedTo?: string }
    ): Promise<ApiResponse<Lead | { created: number; items: Lead[] }>> {
      const requestBody: any = { mode: 'auto' };
      if (opts.forAll) requestBody.forAll = true;
      if (opts.assignedTo) requestBody.assignedTo = String(opts.assignedTo).trim();
      return api
        .post('/admin/leads/create', requestBody, { headers: getAdminH() })
        .then((r) => r.data);
    },
    /** POST /crm/referrals/sync — принудительная синхронизация рефералов в воронку СЕТЬ. token — опционально (например VITE_ADMIN_TOK из env для фоновой синхронизации). */
    adminReferralsSync(token?: string): Promise<
      ApiResponse<{ message: string; viaToken: string | null }>
    > {
      const headers = token != null && String(token).trim()
        ? { 'X-Admin-Token': String(token).trim() }
        : getAdminH();
      return api
        .post('/crm/referrals/sync', undefined, { headers })
        .then((r) => r.data);
    },
  };
}
