import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  Lead,
  LeadStage,
  LeadFile,
  LeadHistory,
  ProductType,
  CreateLeadDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
  LibraryFolder,
  RawFavoriteObject,
  FavoriteObject,
} from './types';
import { getAuthQuery, getAuthHeaders, isValidObjectId, USER_FAVORITES_BASE_URL, OBJECTS_DATES_SECRET } from './client';

const trimLocationSegment = (s: string) => s.replace(/^[\s.,]+|[\s.,]+$/g, '').trim();
const extractLocationFromTitle = (title?: string): string | undefined => {
  if (!title) return undefined;
  const lower = title.toLowerCase();
  const en = lower.indexOf(' in ');
  if (en !== -1) return trimLocationSegment(title.slice(en + 4));
  const ru = lower.indexOf(' в ');
  if (ru !== -1) return trimLocationSegment(title.slice(ru + 3));
  return undefined;
};
const capitalizeWords = (v: string) =>
  v
    .split(/[\s-_]+/)
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join(' ');
const mapRawFavoriteObject = (item: RawFavoriteObject): FavoriteObject => {
  const resolvedImages = [...(item.images || []), ...(item.photos || [])].filter(
    (s): s is string => Boolean(s)
  );
  const loc =
    extractLocationFromTitle(item.title) ||
    (item.propertyType ? capitalizeWords(item.propertyType) : undefined) ||
    (item.dealType ? capitalizeWords(item.dealType) : undefined);
  return {
    id: item._id,
    title: item.title?.trim(),
    location: loc,
    price: item.price,
    pricePerSqm: item.price_sqm,
    pricePerMonth: item.price_per_month,
    rooms: item.rooms,
    area: item.area,
    propertyType: item.propertyType,
    dealType: item.dealType,
    status: item.status,
    coordinates: item.coordinates,
    tags: item.tags,
    amenities: item.amenities,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    imageUrl: resolvedImages[0] || item.image,
    images: resolvedImages,
  };
};

export type ApiContext = {
  api: AxiosInstance;
};

export function createLeadsMethods(ctx: ApiContext) {
  const { api } = ctx;
  const auth = () => getAuthQuery();
  const getLeadLocal = (id: string) => api.get(`/crm/leads/${id}`).then((r) => r.data);
  const getLeadFilesLocal = (leadId: string) =>
    api.get(`/crm/leads/${leadId}/files`).then((r) => r.data);

  const methods = {
    getLeads(params?: {
      page?: number;
      limit?: number;
      stage?: LeadStage;
      productType?: ProductType;
      assignedTo?: string;
      source?: string;
      search?: string;
    }): Promise<ApiResponse<{ items: Lead[]; total: number; page: number; totalPages: number }>> {
      return api
        .get('/crm/leads', { params: { ...params, ...auth() } })
        .then((r) => r.data);
    },
    getLead(id: string): Promise<ApiResponse<Lead>> {
      return api.get(`/crm/leads/${id}`).then((r) => r.data);
    },
    getUserFavorites(email: string): Promise<FavoriteObject[]> {
      if (!email) return Promise.resolve([]);
      const url = `${USER_FAVORITES_BASE_URL}/crm/user-favorites/${encodeURIComponent(String(email).trim())}`;
      return axios.get<{ items?: RawFavoriteObject[] }>(url, { headers: getAuthHeaders() }).then((r) => {
        const items = r.data?.items || [];
        return items.map(mapRawFavoriteObject);
      });
    },
    async createLead(data: CreateLeadDto): Promise<ApiResponse<Lead>> {
      const sanitized: any = {
        name: String(data.name || '').trim(),
        phone: String(data.phone || '').trim(),
        productType: data.productType,
        assignedTo: String(data.assignedTo || '').trim(),
      };
      if (data.email) sanitized.email = String(data.email).trim();
      if (data.city) sanitized.city = String(data.city).trim();
      if (data.source) sanitized.source = String(data.source).trim();
      if (data.notes) sanitized.notes = String(data.notes).trim();
      if (data.dealValue != null) sanitized.dealValue = Number(data.dealValue);
      if (data.expectedCloseDate) sanitized.expectedCloseDate = String(data.expectedCloseDate).trim();
      if (data.budgetValue != null) sanitized.budgetValue = Number(data.budgetValue);
      if (data.budgetCurrency) sanitized.budgetCurrency = data.budgetCurrency;
      try {
        const r = await api.post('/crm/leads', sanitized);
        return r.data;
      } catch (e: any) {
        if (e.response?.status === 409) {
          return {
            success: false,
            message:
              e.response?.data?.message ||
              'Лид с таким номером телефона или email уже существует',
          } as ApiResponse<Lead>;
        }
        throw e;
      }
    },
    async updateLead(id: string, data: UpdateLeadDto): Promise<ApiResponse<Lead>> {
      const allowed = [
        'name',
        'phone',
        'email',
        'city',
        'stage',
        'productType',
        'realtorStage',
        'curatorStage',
        'assignedTo',
        'source',
        'notes',
        'rejectionReason',
        'rejectionComment',
        'dealValue',
        'expectedCloseDate',
        'budgetValue',
        'budgetCurrency',
        'telegram',
        'country',
        'tags',
      ];
      const sanitized: any = {};
      for (const k of allowed) {
        if (!(k in data)) continue;
        const v = (data as any)[k];
        if (k === 'tags' && Array.isArray(v)) {
          sanitized[k] = v.slice(0, 2).map((s: unknown) => String(s).trim().slice(0, 128)).filter(Boolean);
        } else if (v !== undefined && v !== null) {
          if (
            ['name', 'phone', 'email', 'city', 'source', 'notes', 'rejectionComment', 'expectedCloseDate', 'budgetCurrency'].includes(k)
          )
            sanitized[k] = String(v).trim();
          else if (['dealValue', 'budgetValue'].includes(k)) sanitized[k] = Number(v);
          else sanitized[k] = v;
        }
      }
      try {
        const r = await api.patch(`/crm/leads/${id}`, sanitized);
        return r.data;
      } catch (e: any) {
        if (e.response?.status === 409) {
          return {
            success: false,
            message:
              e.response?.data?.message ||
              'Лид с таким номером телефона или email уже существует',
          } as ApiResponse<Lead>;
        }
        throw e;
      }
    },
    addLeadHistoryEntry(
      leadId: string,
      data: { message: string; comment?: string }
    ): Promise<ApiResponse<LeadHistory>> {
      return api
        .post(`/crm/leads/${leadId}/history`, {
          message: data.message.trim(),
          ...(data.comment && { comment: data.comment.trim() }),
        })
        .then((r) => r.data);
    },
    /** Зафиксировать действие контакта: +1 звонок или +1 чат. Бэкенд сохраняет дату сам. */
    recordLeadContactAction(
      leadId: string,
      type: 'call' | 'chat'
    ): Promise<ApiResponse<{ recorded: true }>> {
      return api
        .post(`/crm/leads/${leadId}/contact-action`, { type }, { params: auth() })
        .then((r) => r.data);
    },
    /** Статистика контактов (звонки/чаты) по текущему пользователю за период для аналитики. Всегда запрашивает бэкенд; при 404 возвращает пустые данные. */
    getContactActionsStats(
      period: 'week' | 'month' | 'allTime'
    ): Promise<
      ApiResponse<{
        callsCount: number;
        chatsCount: number;
        timeseries?: Array<{ date: string; calls: number; chats: number }>;
      }>
    > {
      return api
        .get('/crm/analytics/contact-actions', {
          params: { period, ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404) {
            return {
              success: true,
              data: { callsCount: 0, chatsCount: 0, timeseries: [] },
            } as ApiResponse<{ callsCount: number; chatsCount: number; timeseries?: Array<{ date: string; calls: number; chats: number }> }>;
          }
          return r.data;
        });
    },
    /** Активность (звонки/чаты) по email партнёра за период. Требует реализации на бэкенде: GET /crm/analytics/contact-actions/by-email */
    getContactActionsStatsByEmail(
      email: string,
      period: 'week' | 'month' | 'allTime'
    ): Promise<
      ApiResponse<{
        callsCount: number;
        chatsCount: number;
        timeseries?: Array<{ date: string; calls: number; chats: number }>;
      }>
    > {
      if (!email?.trim()) {
        return Promise.resolve({
          success: true,
          data: { callsCount: 0, chatsCount: 0, timeseries: [] },
        } as ApiResponse<{ callsCount: number; chatsCount: number; timeseries: [] }>);
      }
      return api
        .get('/crm/analytics/contact-actions/by-email', {
          params: { email: email.trim(), period, ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404 || !r.data?.data) {
            return {
              success: true,
              data: { callsCount: 0, chatsCount: 0, timeseries: [] },
            } as ApiResponse<{ callsCount: number; chatsCount: number; timeseries: Array<{ date: string; calls: number; chats: number }> }>;
          }
          return r.data;
        })
        .catch(() => ({
          success: true,
          data: { callsCount: 0, chatsCount: 0, timeseries: [] },
        } as ApiResponse<{ callsCount: number; chatsCount: number; timeseries: [] }>));
    },
    /** Лиды по периоду по email (таймсерия). Требует реализации на бэкенде: GET /crm/analytics/leads-stats/by-email */
    getLeadsStatsTimeseriesByEmail(
      email: string,
      period: 'week' | 'month' | 'allTime'
    ): Promise<
      ApiResponse<{
        leadsCount: number;
        timeseries?: Array<{ date: string; leads: number }>;
      }>
    > {
      if (!email?.trim()) {
        return Promise.resolve({ success: true, data: { leadsCount: 0, timeseries: [] } } as ApiResponse<{ leadsCount: number; timeseries: [] }>);
      }
      return api
        .get('/crm/analytics/leads-stats/by-email', {
          params: { email: email.trim(), period, ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404 || !r.data?.data) {
            return { success: true, data: { leadsCount: 0, timeseries: [] } } as ApiResponse<{ leadsCount: number; timeseries: [] }>;
          }
          return r.data;
        })
        .catch(() => ({ success: true, data: { leadsCount: 0, timeseries: [] } } as ApiResponse<{ leadsCount: number; timeseries: [] }>));
    },
    /** Сводка по партнёру за период (KPI). Требует реализации на бэкенде: GET /crm/analytics/partner-summary */
    getPartnerSummary(
      email: string,
      period: 'week' | 'month' | 'allTime'
    ): Promise<
      ApiResponse<{
        addedLeads?: number;
        callClicks?: number;
        chatOpens?: number;
        selectionsCreated?: number;
        deals?: number;
      }>
    > {
      if (!email?.trim()) {
        return Promise.resolve({
          success: true,
          data: { addedLeads: 0, callClicks: 0, chatOpens: 0, selectionsCreated: 0, deals: 0 },
        } as ApiResponse<{ addedLeads: number; callClicks: number; chatOpens: number; selectionsCreated: number; deals: number }>);
      }
      return api
        .get('/crm/analytics/partner-summary', {
          params: { email: email.trim(), period, ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404 || !r.data?.data) {
            return {
              success: true,
              data: { addedLeads: 0, callClicks: 0, chatOpens: 0, selectionsCreated: 0, deals: 0 },
            } as ApiResponse<{ addedLeads: number; callClicks: number; chatOpens: number; selectionsCreated: number; deals: number }>;
          }
          return r.data;
        })
        .catch(() => ({
          success: true,
          data: { addedLeads: 0, callClicks: 0, chatOpens: 0, selectionsCreated: 0, deals: 0 },
        } as ApiResponse<{ addedLeads: number; callClicks: number; chatOpens: number; selectionsCreated: number; deals: number }>));
    },
    /** Единый отчёт по лиду или по текущему пользователю. GET /crm/analytics/lead-report. Без leadId и email — отчёт по текущему пользователю (JWT). */
    getLeadReport(
      params: { leadId?: string; email?: string; period: 'week' | 'month' | 'allTime' }
    ): Promise<
      ApiResponse<{
        lead: { id: string; name: string; email?: string };
        staticKpi: {
          totalLeads: number;
          totalDeals: number;
          level1Referrals: number;
          level2Referrals: number;
          totalListings: number;
        };
        dynamicKpi: {
          addedListings: number;
          addedLevel1Referrals: number;
          addedLevel2Referrals: number;
          addedLeads: number;
          callClicks: number;
          chatOpens: number;
          selectionsCreated: number;
          deals: number;
        };
        leadsTimeseries: Array<{ date: string; leads: number }>;
        activityTimeseries: Array<{ date: string; calls: number; chats: number }>;
        monthActivityTimeseries?: Array<{ date: string; calls: number; chats: number }>;
        allTimeActivityTimeseries?: Array<{ date: string; calls: number; chats: number }>;
        stageCountsByProduct?: {
          sales?: Record<string, number>;
          network?: Record<string, number>;
          owner?: Record<string, number>;
          broker?: Record<string, number>;
        };
        /** Опционально: email рефералов L1 — для fallback подсчёта L2 на фронте (getReferralsCountByEmail для каждого). */
        l1ReferralEmails?: string[];
      }>
    > {
      const { leadId, email, period } = params;
      const query: Record<string, string> = { period, ...auth() };
      if (leadId?.trim()) query.leadId = leadId.trim();
      if (email?.trim()) query.email = email.trim();
      return api
        .get('/crm/analytics/lead-report', { params: query, validateStatus: (s) => s === 200 || s === 404 })
        .then((r) => {
          if (r.status === 404 || !r.data?.data) {
            const empty = {
              lead: { id: '', name: '', email: '' },
              staticKpi: { totalLeads: 0, totalDeals: 0, level1Referrals: 0, level2Referrals: 0, totalListings: 0 },
              dynamicKpi: {
                addedListings: 0, addedLevel1Referrals: 0, addedLevel2Referrals: 0, addedLeads: 0,
                callClicks: 0, chatOpens: 0, selectionsCreated: 0, deals: 0,
              },
              leadsTimeseries: [],
              activityTimeseries: [],
              stageCountsByProduct: {},
            };
            return { success: true, data: empty } as ApiResponse<typeof empty>;
          }
          return r.data;
        })
        .catch(() => ({
          success: false,
          message: 'Ошибка загрузки отчёта по лиду',
        } as ApiResponse<never>));
    },
    /** Лиды по периоду для аналитики (текущий пользователь). */
    getLeadsStats(
      period: 'week' | 'month' | 'allTime'
    ): Promise<
      ApiResponse<{
        leadsCount: number;
        timeseries?: Array<{ date: string; leads: number }>;
      }>
    > {
      return api
        .get('/crm/analytics/leads-stats', {
          params: { period, ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404) {
            return {
              success: true,
              data: { leadsCount: 0, timeseries: [] },
            } as ApiResponse<{ leadsCount: number; timeseries?: Array<{ date: string; leads: number }> }>;
          }
          return r.data;
        });
    },
    /** Отчёт по сети для «Аналитика сети»: KPI и таймсерии по всем партнёрам за period. При 404 — нули. */
    getNetworkReport(period: 'week' | 'month' | 'allTime'): Promise<
      ApiResponse<{
        staticKpi: { totalLeads: number; totalDeals: number; level1Referrals: number; level2Referrals: number; totalListings: number };
        dynamicKpi: {
          addedListings: number;
          addedLevel1Referrals: number;
          addedLevel2Referrals: number;
          addedLeads: number;
          callClicks: number;
          chatOpens: number;
          selectionsCreated: number;
          deals: number;
        };
        todayDelta?: {
          addedListings: number;
          addedLevel1Referrals: number;
          addedLevel2Referrals: number;
          addedLeads: number;
          callClicks: number;
          chatOpens: number;
          selectionsCreated: number;
          deals: number;
        };
        activityTimeseries?: Array<{ date: string; calls: number; chats: number; selections?: number }>;
        leadsTimeseries?: Array<{ date: string; leads: number }>;
      }>
    > {
      return api
        .get('/crm/analytics/network-report', {
          params: { period, ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404 || !r.data?.data) {
            return { success: true, data: null } as ApiResponse<null>;
          }
          return r.data;
        });
    },
    /** План по метрикам (неделя/месяц) для блока «План/факт». Без leadId — план текущего пользователя; с leadId — план партнёра (для карточки). */
    getAnalyticsPlan(params?: { leadId?: string }): Promise<
      ApiResponse<{
        week: { leads: number; contacts: number; deals: number };
        month: { leads: number; contacts: number; deals: number };
      } | null>
    > {
      const query: Record<string, string> = { ...auth() };
      if (params?.leadId?.trim()) query.leadId = params.leadId.trim();
      return api
        .get('/crm/analytics/plan', { params: query, validateStatus: (s) => s === 200 || s === 404 })
        .then((r) => {
          if (r.status === 404) {
            return { success: true, data: null } as ApiResponse<null>;
          }
          return r.data;
        });
    },
    /** Сохранить план по метрикам (неделя/месяц). Без leadId — свой план; с leadId — план партнёра (если есть право). */
    saveAnalyticsPlan(
      payload: {
        week: { leads: number; contacts: number; deals: number };
        month: { leads: number; contacts: number; deals: number };
      },
      params?: { leadId?: string }
    ): Promise<ApiResponse<{ week: typeof payload.week; month: typeof payload.month }>> {
      const query: Record<string, string> = { ...auth() };
      if (params?.leadId?.trim()) query.leadId = params.leadId.trim();
      return api
        .put('/crm/analytics/plan', payload, { params: query })
        .then((r) => r.data);
    },
    getLeadHistory(leadId: string): Promise<
      ApiResponse<
        Array<
          | LeadHistory
          | {
              type: 'stage_comment';
              stage: LeadStage;
              stageName: string;
              comment: string;
              createdAt: string;
              updatedAt: string;
              createdBy: { _id: string; name: string; email: string };
              updatedBy?: { _id: string; name: string; email: string };
            }
        >
      >
    > {
      return api.get(`/crm/leads/${leadId}/history`).then((r) => r.data);
    },
    updateLeadStage(
      id: string,
      data: UpdateLeadStageDto
    ): Promise<ApiResponse<Lead>> {
      //@ts-expect-error
      const allowed = ['stage', 'realtorStage', 'curatorStage', 'comment', 'rejectionReason', 'rejectionComment'];
      const sanitized: any = {};
      if (data.stage !== undefined) sanitized.stage = data.stage;
      if (data.realtorStage !== undefined) sanitized.realtorStage = data.realtorStage;
      if (data.curatorStage !== undefined) sanitized.curatorStage = data.curatorStage;
      if (data.comment) sanitized.comment = String(data.comment).trim();
      if (data.rejectionReason) sanitized.rejectionReason = data.rejectionReason;
      if (data.rejectionComment) sanitized.rejectionComment = String(data.rejectionComment).trim();
      if (!sanitized.stage && !sanitized.realtorStage && !sanitized.curatorStage)
        throw new Error('At least one stage is required');
      return api.patch(`/crm/leads/${id}/stage`, sanitized).then((r) => r.data);
    },
    deleteLead(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
      return api.delete(`/crm/leads/${id}`).then((r) => r.data);
    },
    getLeadsByStage(
      productType?: ProductType,
      assignedTo?: string
    ): Promise<ApiResponse<Record<string, number>>> {
      const params: any = { ...auth() };
      if (productType) params.productType = productType;
      if (assignedTo) params.assignedTo = assignedTo;
      return api.get('/crm/analytics/leads-by-stage', { params }).then((r) => r.data);
    },
    getLeadsByStageByEmail(
      email?: string,
      productType?: ProductType
    ): Promise<ApiResponse<Record<string, number>>> {
      const params: any = { ...auth() };
      if (email?.trim()) params.email = email.trim();
      if (productType) params.productType = productType;
      const a = auth();
      if (a.userId && isValidObjectId(a.userId)) params.userId = a.userId;
      if (a.userRole) params.userRole = a.userRole;
      return api.get('/crm/analytics/leads-by-stage/by-email', { params }).then((r) => r.data);
    },
    /** По каждому продукту (sales, network, owner, broker) — этап → количество лидов пользователя с этим email (createdBy = userId пользователя). Для агрегации воронок по «я + мои партнёры». */
    getLeadsByEmailByStage(email: string): Promise<
      ApiResponse<{
        sales?: Record<string, number>;
        network?: Record<string, number>;
        owner?: Record<string, number>;
        broker?: Record<string, number>;
      }>
    > {
      return api
        .get('/crm/analytics/leads-by-email-by-stage', {
          params: { email: String(email || '').trim(), ...auth() },
          validateStatus: (s) => s === 200 || s === 404,
        })
        .then((r) => {
          if (r.status === 404 || !r.data?.data) {
            return {
              success: true,
              data: { sales: {}, network: {}, owner: {}, broker: {} },
            } as ApiResponse<{ sales: Record<string, number>; network: Record<string, number>; owner: Record<string, number>; broker: Record<string, number> }>;
          }
          return r.data;
        });
    },
    getSalesLeadsCountByEmails(
      emails: string[]
    ): Promise<ApiResponse<Record<string, number>>> {
      return api
        .post('/crm/analytics/sales-leads-count/by-emails', { emails }, { params: auth() })
        .then((r) => r.data);
    },
    getSalesLeadsCountByUserIds(
      userIds: string[]
    ): Promise<ApiResponse<Record<string, number>>> {
      return api
        .post('/crm/analytics/sales-leads-count/by-user-ids', { userIds }, { params: auth() })
        .then((r) => r.data);
    },
    async getLeadsStatsByEmail(
      email?: string,
      productType?: ProductType
    ): Promise<ApiResponse<Record<string, number>>> {
      const params: any = { ...auth() };
      if (email?.trim()) params.email = email.trim();
      if (productType) params.productType = productType;
      const a = auth();
      if (a.userId && isValidObjectId(a.userId)) params.userId = a.userId;
      else if (a.userId) console.warn('[getLeadsStatsByEmail] Invalid userId:', a.userId);
      if (a.userRole) params.userRole = a.userRole;
      try {
        return await api.get('/crm/analytics/leads-by-stage/by-email', { params }).then((r) => r.data);
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || '';
        const status = e?.response?.status;
        if (status === 403 || msg.includes('нет доступа')) {
          return {
            success: false,
            message: 'У вас нет доступа к статистике этого пользователя',
          } as ApiResponse<Record<string, number>>;
        }
        if (msg.includes('Неверный формат ID') || msg.includes('ObjectId')) {
          return {
            success: false,
            message: 'Неверный формат ID пользователя в токене авторизации.',
          } as ApiResponse<Record<string, number>>;
        }
        if (msg.includes('не найден') || msg.includes('not found')) {
          return {
            success: false,
            message: 'Пользователь с указанным email не найден',
          } as ApiResponse<Record<string, number>>;
        }
        throw e;
      }
    },
    getLeadsCountByEmail(email?: string): Promise<ApiResponse<{ count: number }>> {
      if (!email?.trim()) {
        return Promise.resolve({
          success: false,
          message: 'Email не указан',
        } as ApiResponse<{ count: number }>);
      }
      return api
        .get('/crm/leads/count', { params: { email: email.trim() } })
        .then((r) => {
          if (r.data.success && r.data.data) {
            const c = typeof r.data.data.count === 'number' ? r.data.data.count : 0;
            return { success: true, data: { count: c } } as ApiResponse<{ count: number }>;
          }
          return r.data;
        })
        .catch((e: any) => ({
          success: false,
          message: e?.response?.data?.message || e?.message || 'Ошибка при получении количества лидов',
        } as ApiResponse<{ count: number }>));
    },
    getReferralsCountByEmail(email: string): Promise<ApiResponse<{ totalCount: number }>> {
      if (!email?.trim()) {
        return Promise.resolve({ success: false, message: 'Email не указан' } as ApiResponse<{ totalCount: number }>);
      }
      const url = `${USER_FAVORITES_BASE_URL}/crm/referrals/count?email=${encodeURIComponent(email.trim())}`;
      return axios.get<ApiResponse<{ totalCount: number }>>(url, { headers: getAuthHeaders() }).then((r) => r.data).catch((e: any) => {
        if (e?.response?.status === 404)
          return { success: false, message: 'User not found' } as ApiResponse<{ totalCount: number }>;
        throw e;
      });
    },
    getObjectsCountByEmail(
      type: 'secondary' | 'rent',
      email: string
    ): Promise<ApiResponse<{ totalCount: number; type: string }>> {
      if (!email?.trim()) {
        return Promise.resolve({ success: false, message: 'Email не указан' } as any);
      }
      const url = `${USER_FAVORITES_BASE_URL}/crm/objects/count?type=${type}&email=${encodeURIComponent(email.trim())}`;
      return axios.get(url, { headers: getAuthHeaders() }).then((r) => r.data).catch((e: any) => {
        if (e?.response?.status === 404) return { success: false, message: 'User not found' } as any;
        throw e;
      });
    },
    getTotalObjectsCountByEmail(email: string): Promise<ApiResponse<{ totalCount: number }>> {
      return (async () => {
        const fallback = (t: 'secondary' | 'rent'): ApiResponse<{ totalCount: number; type: string }> =>
          ({ success: false, data: { totalCount: 0, type: t } });
        const headers = getAuthHeaders();
        const [sec, rent] = await Promise.all([
          axios.get<ApiResponse<{ totalCount: number; type: string }>>(
            `${USER_FAVORITES_BASE_URL}/crm/objects/count?type=secondary&email=${encodeURIComponent(email.trim())}`,
            { headers }
          ).then((r) => r.data).catch((e: any) => (e?.response?.status === 404 ? fallback('secondary') : Promise.reject(e))),
          axios.get<ApiResponse<{ totalCount: number; type: string }>>(
            `${USER_FAVORITES_BASE_URL}/crm/objects/count?type=rent&email=${encodeURIComponent(email.trim())}`,
            { headers }
          ).then((r) => r.data).catch((e: any) => (e?.response?.status === 404 ? fallback('rent') : Promise.reject(e))),
        ]);
        const sc = sec.success ? (sec.data?.totalCount || 0) : 0;
        const rc = rent.success ? (rent.data?.totalCount || 0) : 0;
        if (!sec.success && !rent.success) {
          return { success: false, message: 'Не удалось получить количество объектов' } as ApiResponse<{ totalCount: number }>;
        }
        return { success: true, data: { totalCount: sc + rc } } as ApiResponse<{ totalCount: number }>;
      })();
    },
    getReferralsTotalObjects(email: string): Promise<ApiResponse<{ total: number }>> {
      if (!email?.trim()) return Promise.resolve({ success: false, message: 'Email не указан' } as any);
      const url = `${USER_FAVORITES_BASE_URL}/crm/referrals/getTotalObjects?email=${encodeURIComponent(email.trim())}`;
      return axios.get(url, { headers: getAuthHeaders() }).then((r) => r.data).catch((e: any) => {
        if (e?.response?.status === 404) return { success: false, message: 'User not found' } as any;
        return {
          success: false,
          message: e?.response?.data?.message || e?.message || 'Ошибка',
        } as any;
      });
    },
    getReferralsJoinDate(email: string): Promise<ApiResponse<{ date: string[] }>> {
      if (!email?.trim()) return Promise.resolve({ success: false, message: 'Email не указан' } as any);
      const url = `${USER_FAVORITES_BASE_URL}/crm/referrals/getJoinDate?email=${encodeURIComponent(email.trim())}`;
      return axios.get(url, { headers: getAuthHeaders() }).then((r) => r.data).catch((e: any) => {
        if (e?.response?.status === 404) return { success: false, message: 'User not found' } as any;
        return { success: false, message: e?.response?.data?.message || e?.message || 'Ошибка' } as any;
      });
    },
    /** Объекты пользователя по email (поиск по почте). POST /crm/user/objects/dates/{secret} */
    getMyObjectsByEmail(email: string): Promise<ApiResponse<{ items: Array<{ _id: string; title?: string; dealType?: string; status?: string; createdAt?: string; updatedAt?: string }> }>> {
      if (!email?.trim()) return Promise.resolve({ success: false, message: 'Email не указан' } as any);
      const url = `${USER_FAVORITES_BASE_URL}/crm/user/objects/dates/${OBJECTS_DATES_SECRET}`;
      type Item = { _id: string; title?: string; dealType?: string; status?: string; createdAt?: string; updatedAt?: string };
      return axios
        .post<{ items?: Item[] }>(url, { email: email.trim() }, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
        .then((r) => {
          const items: Item[] = Array.isArray(r.data?.items) ? r.data.items : [];
          return { success: true, data: { items } };
        })
        .catch((e: any) => ({
          success: false,
          message: e?.response?.data?.message || e?.message || 'Ошибка при получении объектов',
        } as ApiResponse<{ items: Item[] }>));
    },
    async getAllNumbersLeads(email: string): Promise<ApiResponse<{ count: number }>> {
      if (!email?.trim()) return { success: false, message: 'Email не указан' } as any;
      const params: any = { email: email.trim(), ...auth() };
      const a = auth();
      if (a.userId && isValidObjectId(a.userId)) params.userId = a.userId;
      if (a.userRole) params.userRole = a.userRole;
      try {
        return await api.get('/crm/analytics/getAllNumbersLeads', { params }).then((r) => r.data);
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || '';
        if (e?.response?.status === 403 || msg.includes('нет доступа')) {
          return { success: false, message: 'У вас нет доступа' } as any;
        }
        if (msg.includes('не найден') || msg.includes('not found')) {
          return { success: true, data: { count: 0 } } as ApiResponse<{ count: number }>;
        }
        throw e;
      }
    },
    async getAllNumbersLeadsForAllCategories(
      email: string
    ): Promise<ApiResponse<Array<{ stage: LeadStage; count: number }>>> {
      if (!email?.trim()) return { success: false, message: 'Email не указан' } as any;
      const params: any = { email: email.trim(), ...auth() };
      const a = auth();
      if (a.userId && isValidObjectId(a.userId)) params.userId = a.userId;
      if (a.userRole) params.userRole = a.userRole;
      try {
        return await api
          .get('/crm/analytics/getAllNumbersLeadsForAllCategories', { params })
          .then((r) => r.data);
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || '';
        if (e?.response?.status === 403 || msg.includes('нет доступа')) {
          return { success: false, message: 'У вас нет доступа' } as any;
        }
        if (msg.includes('не найден') || msg.includes('not found')) {
          return { success: true, data: [] } as ApiResponse<Array<{ stage: LeadStage; count: number }>>;
        }
        throw e;
      }
    },
    uploadLeadFile(
      leadId: string,
      file: File
    ): Promise<ApiResponse<{ lead: Lead; message: string }>> {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post(`/crm/leads/${leadId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        })
        .then((r) => r.data);
    },
    async uploadLeadFilesBulk(
      leadId: string,
      files: File[]
    ): Promise<ApiResponse<{ lead: Lead; message: string }>> {
      const fd = new FormData();
      files.forEach((f) => fd.append('files[]', f));
      const timeout = Math.max(30000, 30000 + Math.ceil(files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)) * 1000);
      try {
        return await api
          .post(`/crm/leads/${leadId}/files`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout,
          })
          .then((r) => r.data);
      } catch (e: any) {
        if (e.response?.status === 404) {
          const fd2 = new FormData();
          files.forEach((f) => fd2.append('files', f));
          return api.post(`/crm/leads/${leadId}/files`, fd2, {
            headers: { 'Content-Type': 'multipart/form-data' },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout,
          }).then((r) => r.data);
        }
        throw e;
      }
    },
    getLeadFiles(leadId: string): Promise<ApiResponse<{ files: LeadFile[]; count: number }>> {
      return api.get(`/crm/leads/${leadId}/files`).then((r) => r.data);
    },
    getLeadsByEmails(
      emails: string[]
    ): Promise<
      ApiResponse<{
        items: Lead[];
        total: number;
        emailsFound: number;
        emailsNotFound: string[];
      }>
    > {
      return api
        .post('/crm/leads/by-emails', { emails }, { params: auth() })
        .then((r) => r.data);
    },
    saveChecklistState(
      leadId: string,
      items: Array<{ stage: LeadStage; index: number; checked: boolean }>
    ): Promise<ApiResponse<{ leadId: string; savedCount: number }>> {
      return api
        .post(`/crm/leads/${leadId}/checklist`, { items }, { params: auth() })
        .then((r) => r.data);
    },
    getChecklistState(leadId: string): Promise<
      ApiResponse<{
        leadId: string;
        items: Array<{ stage: LeadStage; index: number; checked: boolean; updatedAt: string }>;
        totalChecked: number;
        totalItems: number;
      }>
    > {
      return api
        .get(`/crm/leads/${leadId}/checklist`, { params: auth() })
        .then((r) => r.data);
    },
    updateChecklistItem(
      leadId: string,
      stage: LeadStage,
      index: number,
      checked: boolean
    ): Promise<
      ApiResponse<{
        leadId: string;
        stage: LeadStage;
        index: number;
        checked: boolean;
        updatedAt: string;
      }>
    > {
      return api
        .patch(`/crm/leads/${leadId}/checklist/item`, { stage, index, checked }, { params: auth() })
        .then((r) => r.data);
    },
    async deleteLeadFileByName(
      leadId: string,
      filename: string
    ): Promise<ApiResponse<{ lead: Lead; message: string }>> {
      try {
        const enc = encodeURIComponent(filename);
        const r = await api.delete(`/crm/leads/${leadId}/files/by-name/${enc}`, {
          params: auth(),
        });
        if (!r.data.success) throw new Error(r.data.message || 'Failed to delete file');
        const leadR = await getLeadLocal(leadId);
        if (leadR.success && leadR.data) {
          return {
            success: true,
            data: {
              lead: leadR.data,
              message: (r.data.data as any)?.message || r.data.message || 'File deleted successfully',
            },
          } as ApiResponse<{ lead: Lead; message: string }>;
        }
        return {
          success: true,
          message: (r.data.data as any)?.message || r.data.message || 'File deleted successfully',
        } as ApiResponse<{ lead: Lead; message: string }>;
      } catch (e: any) {
        if (e.response?.status === 404) {
          const leadR = await getLeadLocal(leadId);
          if (leadR.success && leadR.data) {
            return {
              success: true,
              data: { lead: leadR.data, message: 'File may have been already deleted' },
            } as ApiResponse<{ lead: Lead; message: string }>;
          }
        }
        throw e;
      }
    },
    async deleteLeadFileByIndex(
      leadId: string,
      fileIndex: number
    ): Promise<ApiResponse<{ lead: Lead; message: string }>> {
      const filesR = await getLeadFilesLocal(leadId);
      if (!filesR.success || !filesR.data?.files) throw new Error('Failed to get lead files');
      const files = filesR.data.files;
      if (fileIndex < 0 || fileIndex >= files.length) throw new Error(`Invalid file index: ${fileIndex}`);
      return methods.deleteLeadFileByName(leadId, files[fileIndex].filename);
    },
    getBaseFiles(productType?: ProductType): Promise<ApiResponse<{ files: LeadFile[]; count: number }>> {
      const params: any = auth();
      if (productType) params.productType = productType;
      return api.get('/crm/files/base', { params }).then((r) => r.data);
    },
    attachBaseFilesToLead(
      leadId: string,
      fileIds: string[]
    ): Promise<ApiResponse<{ lead: Lead; message: string; attachedCount: number }>> {
      return api
        .post(`/crm/leads/${leadId}/files/attach-base`, { fileIds }, { params: auth() })
        .then((r) => r.data);
    },
    uploadBaseFiles(
      files: File[],
      productType: ProductType,
      adminToken: string
    ): Promise<ApiResponse<{ files: LeadFile[]; uploadedCount: number }>> {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('productType', productType);
      return api
        .post('/crm/files/base/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data', 'X-Admin-Token': adminToken },
        })
        .then((r) => r.data)
        .catch((e: any) => {
          if (e?.response?.status === 413) {
            const total = files.reduce((s, f) => s + f.size, 0);
            throw {
              ...e,
              response: {
                ...e.response,
                data: {
                  ...e.response?.data,
                  message: `Файлы слишком большие (${(total / (1024 * 1024)).toFixed(2)}MB)`,
                },
              },
            };
          }
          throw e;
        });
    },
    deleteBaseFile(
      fileId: string,
      adminToken: string
    ): Promise<ApiResponse<{ deleted: boolean; message: string }>> {
      return api
        .delete(`/crm/files/base/${fileId}`, { headers: { 'X-Admin-Token': adminToken } })
        .then((r) => r.data);
    },
    getRealtorLibraryFiles(
      folderId?: string | null,
      includeFolders?: boolean,
      productType?: ProductType
    ): Promise<
      ApiResponse<{
        files: LeadFile[];
        folders?: LibraryFolder[];
        count: number;
        foldersCount?: number;
      }>
    > {
      const params: any = auth();
      if (folderId != null) params.folderId = folderId;
      if (includeFolders) params.includeFolders = 'true';
      if (productType) params.productType = productType;
      return api.get('/crm/files/library', { params }).then((r) => r.data);
    },
    uploadLibraryFiles(
      files: File[],
      folderId?: string | null
    ): Promise<ApiResponse<{ files: LeadFile[]; uploadedCount: number }>> {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      if (folderId) fd.append('folderId', folderId);
      return api
        .post('/crm/files/library/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: auth(),
        })
        .then((r) => r.data);
    },
    attachLibraryFilesToLead(
      leadId: string,
      fileIds: string[]
    ): Promise<ApiResponse<{ lead: Lead; message: string; attachedCount: number }>> {
      return api
        .post(`/crm/leads/${leadId}/files/attach-library`, { fileIds }, { params: auth() })
        .then((r) => r.data);
    },
    deleteLibraryFile(fileId: string): Promise<ApiResponse<{ deleted: boolean; message: string }>> {
      return api
        .delete(`/crm/files/library/${fileId}`, { params: auth() })
        .then((r) => r.data);
    },
    createLibraryFolder(
      folderName: string,
      parentFolderId?: string | null
    ): Promise<ApiResponse<{ folder: LibraryFolder }>> {
      return api
        .post(
          '/crm/files/library/folders',
          { name: folderName, parentId: parentFolderId || null },
          { params: auth() }
        )
        .then((r) => r.data);
    },
    deleteLibraryFolder(
      folderId: string,
      force?: boolean
    ): Promise<
      ApiResponse<{
        deleted: boolean;
        message: string;
        deletedFilesCount?: number;
        deletedSubfoldersCount?: number;
      }>
    > {
      const params: any = auth();
      if (force) params.force = 'true';
      return api
        .delete(`/crm/files/library/folders/${folderId}`, { params })
        .then((r) => r.data);
    },
    createStageComment(
      leadId: string,
      stage: LeadStage,
      comment: string
    ): Promise<
      ApiResponse<{
        _id: string;
        leadId: string;
        stage: LeadStage;
        comment: string;
        createdBy: string;
        updatedBy?: string;
        createdAt: string;
        updatedAt: string;
      }>
    > {
      return api
        .post(`/crm/leads/${leadId}/stage-comment`, { stage, comment: comment.trim() })
        .then((r) => r.data);
    },
    getStageComment(
      leadId: string,
      stage: LeadStage
    ): Promise<
      ApiResponse<{
        _id: string;
        leadId: string;
        stage: LeadStage;
        comment: string;
        createdBy: { _id: string; name: string; email: string };
        updatedBy?: { _id: string; name: string; email: string };
        createdAt: string;
        updatedAt: string;
      } | null>
    > {
      return api
        .get(`/crm/leads/${leadId}/stage-comment/${stage}`)
        .then((r) => r.data);
    },
    getStageComments(leadId: string): Promise<
      ApiResponse<
        Array<{
          _id: string;
          leadId: string;
          stage: LeadStage;
          comment: string;
          createdBy: { _id: string; name: string; email: string };
          updatedBy?: { _id: string; name: string; email: string };
          createdAt: string;
          updatedAt: string;
        }>
      >
    > {
      return api.get(`/crm/leads/${leadId}/stage-comments`).then((r) => r.data);
    },
    deleteStageComment(
      leadId: string,
      stage: LeadStage
    ): Promise<ApiResponse<{ deleted: boolean }>> {
      return api
        .delete(`/crm/leads/${leadId}/stage-comment/${stage}`)
        .then((r) => r.data);
    },
    registerLeadFile(
      leadId: string,
      fileInfo: {
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }
    ): Promise<ApiResponse<Lead>> {
      return api
        .post(`/crm/leads/${leadId}/files/register`, fileInfo, { params: auth() })
        .then((r) => r.data);
    },
    registerLeadFilesBulk(
      leadId: string,
      filesInfo: Array<{
        url: string;
        key: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
      }>
    ): Promise<ApiResponse<Lead>> {
      return api
        .post(`/crm/leads/${leadId}/files/register/bulk`, { files: filesInfo }, { params: auth() })
        .then((r) => r.data);
    },
  };
  return methods;
}
