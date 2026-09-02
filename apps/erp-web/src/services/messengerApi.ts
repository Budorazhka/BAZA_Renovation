import axios from 'axios';
import { MESSENGERS_API_URL } from '@/config/backend';

const api = axios.create({
  baseURL: MESSENGERS_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('msgr_jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshMessengerToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('msgr_refresh_token');
  if (!refreshToken) return null;

  try {
    const response = await axios.post<{ success?: boolean; token?: string }>(
      `${MESSENGERS_API_URL}/auth/refresh`,
      { refreshToken }
    );
    const newToken = response.data?.token;
    if (newToken) {
      localStorage.setItem('msgr_jwt_token', newToken);
      return newToken;
    }
  } catch {
    localStorage.removeItem('msgr_jwt_token');
    localStorage.removeItem('msgr_refresh_token');
  }
  return null;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config;
    if (!original || original._msgrRetried || error?.response?.status !== 401) {
      return Promise.reject(error);
    }

    if (!refreshPromise) {
      refreshPromise = refreshMessengerToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newToken = await refreshPromise;
    if (!newToken) {
      return Promise.reject(error);
    }

    original._msgrRetried = true;
    original.headers = original.headers || {};
    original.headers.Authorization = `Bearer ${newToken}`;
    return api.request(original);
  }
);

export interface Account {
  _id: string;
  platform: 'telegram' | 'whatsapp';
  accountType?: 'bot' | 'user';
  name: string;
  telegramBotUsername?: string;
  telegramPhoneNumber?: string;
  telegramAuthStatus?: 'pending' | 'authenticated' | 'disconnected';
  whatsappAuthStatus?: 'pending' | 'authenticated' | 'disconnected';
  isActive: boolean;
  lastSyncAt?: string;
}

export function isWhatsAppConnected(account: Account): boolean {
  return account.platform === 'whatsapp' && account.whatsappAuthStatus === 'authenticated';
}

export function isTelegramConnected(account: Account): boolean {
  if (account.platform !== 'telegram') return false;
  if (account.accountType === 'bot' || account.telegramBotUsername) {
    return account.isActive !== false;
  }
  return account.telegramAuthStatus === 'authenticated';
}

export function isMessengerAccountConnected(account: Account): boolean {
  if (account.platform === 'whatsapp') return isWhatsAppConnected(account);
  if (account.platform === 'telegram') return isTelegramConnected(account);
  return false;
}

export interface DossierGoals {
  goalType?: 'life' | 'investment' | 'rent' | 'relocation' | 'capital' | 'business';
  goalDetail?: string;
  emotionalTriggers?: string[];
}

export interface DossierGeography {
  city?: string;
  district?: string;
  microLocation?: string;
  undesirableZones?: string[];
  geoLogic?: string;
}

export interface DossierFinance {
  totalBudget?: string;
  comfortableBudget?: string;
  maxBudget?: string;
  downPayment?: string;
  installment?: string;
  credit?: string;
  currency?: string;
  purchaseTimeline?: string;
  priceSensitivity?: 'high' | 'medium' | 'low';
}

export interface DossierPropertyProfile {
  propertyType?: string;
  rooms?: string;
  areaMin?: number;
  areaMax?: number;
  view?: string;
  condition?: string;
  deliveryDate?: string;
  unwanted?: string[];
}

export interface DossierObjections {
  mainObstacle?: string;
  howToRemove?: string;
  fears?: string[];
  churnRisk?: number;
}

export interface DossierDecisionMakers {
  decisionMaker?: string;
  whoPays?: string;
  influencers?: string[];
  opponents?: string[];
}

export interface DossierCommunication {
  preferredChannel?: string;
  bestTimeToContact?: string;
  communicationStyle?: string;
  tone?: string;
}

export interface DossierBehavior {
  responseSpeed?: string;
  messageFrequency?: string;
  engagementLevel?: string;
}

export interface DossierInvestmentProfile {
  investorType?: string;
  mainInvestmentGoal?: string;
  investmentHorizon?: string;
  attitudeToRisk?: string;
}

export interface DossierMatchingProfile {
  matchScore?: number;
  matchReasons?: string[];
}

export interface DossierScoring {
  temperature?: number;
  dealProbability?: number;
  leadQuality?: number;
  investmentMaturity?: 'newbie' | 'learning' | 'experienced' | 'professional';
  competitorChurnRisk?: number;
}

export interface DossierTrust {
  trustToManager?: number;
  trustToPlatform?: number;
  trustToCountry?: number;
  trustToDevelopers?: number;
}

export interface DossierLegalReadiness {
  dealReadiness?: string;
  documentsReady?: string;
  moneyReady?: string;
}

export interface DossierRecommendations {
  whatToOffer?: string[];
  whatNotToOffer?: string[];
  managerTask?: string;
}

export interface DossierDataQuality {
  aiConfidence?: number;
  needsClarification?: string[];
  confirmedFacts?: string[];
  assumptions?: string[];
}

export interface ClientDossier {
  summary: string;
  clientIntent: string;
  budget?: string;
  location?: string;
  readiness?: string;
  characteristics: string[];
  risks: string[];
  aiIntentions: string[];
  suggestedReplies: string[];
  goals?: DossierGoals;
  geography?: DossierGeography;
  finance?: DossierFinance;
  propertyProfile?: DossierPropertyProfile;
  objections?: DossierObjections;
  decisionMakers?: DossierDecisionMakers;
  communication?: DossierCommunication;
  behavior?: DossierBehavior;
  investmentProfile?: DossierInvestmentProfile;
  matchingProfile?: DossierMatchingProfile;
  scoring?: DossierScoring;
  trust?: DossierTrust;
  legalReadiness?: DossierLegalReadiness;
  recommendations?: DossierRecommendations;
  dataQuality?: DossierDataQuality;
  status?: 'analyzing' | 'ready' | 'error';
  errorMessage?: string;
  updatedAt?: string;
}

export type AiStyleLevel = 'low' | 'mid' | 'high';

export interface AiPersonalitySettings {
  tone: AiStyleLevel;
  frequency: AiStyleLevel;
  pressure: AiStyleLevel;
}

export const DEFAULT_AI_PERSONALITY: AiPersonalitySettings = {
  tone: 'mid',
  frequency: 'mid',
  pressure: 'mid',
};

/** Контекст лида, передаваемый ИИ при генерации/отправке сообщения */
export interface CrmLeadContext {
  /** ID лида в CRM */
  leadId: string;
  /** Имя лида */
  name: string;
  /** Телефон */
  phone: string;
  /** Email */
  email?: string;
  /** Город */
  city?: string;
  /** Стадия воронки */
  stage: string;
  /** Тип продукта */
  productType: string;
  /** Источник */
  source?: string;
  /** Описание лида (поле notes в карточке лида — текущий текст) */
  notes?: string;
  /** Бюджет */
  dealValue?: number;
  /** Теги */
  tags?: string[];
}

export interface CrmActionLog {
  action: string;
  request?: string;
  result?: string;
  error?: string;
}

export interface CrmLeadUpdateEvent {
  dialogId: string;
  accountId: string;
  leadId: string | null;
  action: 'none' | 'create_lead' | 'link_lead' | 'move_stage' | 'record_contact';
  stage: string;
  shouldMove: boolean;
  notification: string;
  logs: CrmActionLog[];
  analysis: {
    currentStage: string;
    recommendedStage: string;
    confidence: number;
    reason: string;
    clientSummary: string;
    recommendation: string;
    nextActions: string[];
    techComment?: string;
  };
}

export interface CrmContextUpdateEvent {
  dialogId: string;
  accountId: string;
  crmContext: {
    status: 'no_crm' | 'waiting_data' | 'ready_to_create' | 'linked';
    techLine?: string;
  };
}

export interface CrmActionRequiredEvent {
  dialogId: string;
  accountId: string;
  action: 'no_crm' | 'already_linked' | 'waiting_data' | 'move_stage' | 'add_history' | 'add_comment' | 'update_lead' | 'create_task';
  payload: Record<string, unknown>;
  analysis: {
    currentStage: string;
    hasCrm: boolean;
    hasLead: boolean;
    extractedName?: string;
    extractedPhone?: string;
    extractedEmail?: string;
    extractedCity?: string;
    missingFields: string[];
  };
}

export interface Dialog {
  _id: string;
  accountId: string;
  platform: 'telegram' | 'whatsapp';
  externalChatId: string;
  name: string;
  avatarUrl?: string;
  chatType?: 'private' | 'group' | 'channel';
  isOnline?: boolean;
  aiEnabled?: boolean;
  aiSettings?: AiPersonalitySettings;
  clientDossier?: ClientDossier;
  unreadCount: number;
  lastMessage?: {
    text: string;
    timestamp: string;
    fromMe: boolean;
  };
  crmLeadId?: string;
  crmLeadStage?: string;
  lastCrmSyncAt?: string;
  ownerAiDirectives?: string;
  crmContext?: {
    status: 'no_crm' | 'waiting_data' | 'ready_to_create' | 'linked';
    techLine?: string;
  };
}

export interface Message {
  _id: string;
  dialogId: string;
  externalMessageId?: string;
  text: string;
  messageType: 'text' | 'photo' | 'video' | 'document' | 'audio' | 'sticker' | 'location' | 'gif' | 'unknown';
  fromMe: boolean;
  senderName?: string;
  isRevoked?: boolean;
  isEdited?: boolean;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  sentAt: string;
  isAiReply?: boolean;
  media?: {
    url?: string;
    urls?: string[];
    mimeType?: string;
    fileName?: string;
  };
}

export interface AiHistorySummary {
  whatHappened: string;
  clientMessages: string;
  aiReplies: string;
  updatedData: string;
}

export interface AiHistoryEntry {
  _id: string;
  dialogId: string;
  userId: string;
  date: string;
  summary: AiHistorySummary;
  readBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AiHistoryResponse {
  success: boolean;
  history: AiHistoryEntry[];
  unreadCount: number;
}

export interface OwnerAiChatMessage {
  _id: string;
  dialogId: string;
  userId: string;
  role: 'owner' | 'assistant';
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerAiChatResponse {
  success: boolean;
  messages: OwnerAiChatMessage[];
  directives: string;
  completedDirectives?: string;
  ownerMessage?: OwnerAiChatMessage;
  assistantMessage?: OwnerAiChatMessage;
}

export const messengerApi = {
  getAccounts: async () => {
    const response = await api.get<{ success: boolean; accounts: Account[] }>('/accounts');
    return response.data;
  },
  
  /**
   * Начинает исходящий диалог: находит/создаёт чат по номеру (WhatsApp) или
   * @username / chat id (Telegram) и отправляет первое сообщение.
   * `crmOldLeadId` связывает диалог со записью «старых лидов» — AI-сервис
   * создаст по нему обычный лид в CRM.
   */
  startDialog: async (
    accountId: string,
    payload: { to: string; text: string; name?: string; notes?: string; crmOldLeadId?: string },
  ) => {
    const response = await api.post<{
      success: boolean;
      dialog: Dialog;
      message?: Message;
      error?: string;
    }>(`/accounts/${accountId}/dialogs/start`, payload);
    return response.data;
  },

  getDialogs: async (accountId: string) => {
    const response = await api.get<{ success: boolean; dialogs: Dialog[] }>(`/accounts/${accountId}/dialogs`);
    return response.data;
  },
  
  getMessages: async (dialogId: string, limit = 100, offset = 0) => {
    const response = await api.get<{ success: boolean; messages: Message[] }>(`/dialogs/${dialogId}/messages`, {
      params: { limit, offset }
    });
    return response.data;
  },
  
  sendMessage: async (dialogId: string, text: string) => {
    const response = await api.post<{ success: boolean; message: Message }>(`/dialogs/${dialogId}/messages`, { text });
    return response.data;
  },

  generateMessage: async (dialogId: string, hint?: string, aiSettings?: AiPersonalitySettings, leadContext?: CrmLeadContext) => {
    const response = await api.post<{ success: boolean; text: string }>(
      `/dialogs/${dialogId}/messages/generate`,
      { hint, aiSettings, leadContext }
    );
    return response.data;
  },

  sendAiMessage: async (dialogId: string, hint?: string, aiSettings?: AiPersonalitySettings, leadContext?: CrmLeadContext) => {
    const response = await api.post<{ success: boolean; message: Message; text: string; aiEnabled?: boolean }>(
      `/dialogs/${dialogId}/messages/ai-send`,
      { hint, aiSettings, leadContext }
    );
    return response.data;
  },

  sendMedia: async (dialogId: string, file: File, caption?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);

    const response = await api.post<{ success: boolean; message: Message }>(
      `/dialogs/${dialogId}/messages/media`,
      formData
    );
    return response.data;
  },
  
  addTelegramBot: async (name: string, botToken: string) => {
    const response = await api.post<{ success: boolean; data: Account }>('/accounts/telegram/bot', { name, botToken });
    return response.data;
  },

  startTelegramUserAuth: async (name: string, phone: string) => {
    const response = await api.post<{ success: boolean; account: Account; message?: string }>(
      '/accounts/telegram/user',
      { name, phone }
    );
    return response.data;
  },

  verifyTelegramCode: async (accountId: string, code: string) => {
    const response = await api.post<{ success: boolean; needsPassword?: boolean; accountId?: string }>(
      `/accounts/telegram/${accountId}/verify-code`,
      { code }
    );
    return response.data;
  },

  verifyTelegramPassword: async (accountId: string, password: string) => {
    const response = await api.post<{ success: boolean }>(
      `/accounts/telegram/${accountId}/verify-password`,
      { password }
    );
    return response.data;
  },
  
  addWhatsApp: async (name: string) => {
    const response = await api.post<{ success: boolean; account: Account }>('/accounts/whatsapp', { name });
    return response.data;
  },
  
  deleteAccount: async (accountId: string) => {
    const response = await api.delete<{ success: boolean }>(`/accounts/${accountId}`);
    return response.data;
  },

  deleteDialog: async (dialogId: string) => {
    const response = await api.delete<{ success: boolean }>(`/dialogs/${dialogId}`);
    return response.data;
  },
  
  getWhatsAppStatus: async (accountId: string) => {
    const response = await api.get<{ success: boolean; status: string; qrCode?: string }>(`/accounts/whatsapp/${accountId}/auth-status`);
    return response.data;
  },
  
  syncDialogs: async (accountId: string) => {
    const response = await api.post<{ success: boolean; synced?: number }>(`/accounts/${accountId}/dialogs/sync`);
    return response.data;
  },

  markDialogRead: async (dialogId: string) => {
    const response = await api.post<{ success: boolean; dialogId: string; unreadCount: number }>(
      `/dialogs/${dialogId}/read`
    );
    return response.data;
  },

  setDialogAiEnabled: async (dialogId: string, enabled: boolean) => {
    const response = await api.patch<{ success: boolean; dialog: Dialog }>(
      `/dialogs/${dialogId}/ai`,
      { enabled }
    );
    return response.data;
  },

  setAccountDialogsAiEnabled: async (accountId: string, enabled: boolean) => {
    const response = await api.patch<{ success: boolean; updated: number }>(
      `/accounts/${accountId}/dialogs/ai-bulk`,
      { enabled }
    );
    return response.data;
  },

  setGlobalAiEnabled: async (enabled: boolean) => {
    const response = await api.patch<{ success: boolean; aiGloballyEnabled: boolean }>(
      '/auth/ai-global',
      { enabled }
    );
    return response.data;
  },

  setDialogAiSettings: async (dialogId: string, settings: Partial<AiPersonalitySettings>) => {
    const response = await api.patch<{ success: boolean; dialog: Dialog }>(
      `/dialogs/${dialogId}/ai-settings`,
      settings
    );
    return response.data;
  },

  refreshClientDossier: async (dialogId: string) => {
    const response = await api.post<{ success: boolean; dialogId: string; clientDossier: ClientDossier }>(
      `/dialogs/${dialogId}/dossier/refresh`
    );
    return response.data;
  },

  openTelegramChat: async (accountId: string, username: string) => {
    const response = await api.post<{ success: boolean; dialog: Dialog }>(
      `/accounts/${accountId}/dialogs/telegram/open`,
      { username }
    );
    return response.data;
  },

  refreshDialogPresence: async (dialogId: string) => {
    const response = await api.post<{ success: boolean; dialog: Dialog }>(`/dialogs/${dialogId}/presence`);
    return response.data;
  },
  
  login: async (
    email: string,
    password: string,
    demo?: { demoUserId: string; teamId?: string; role?: string },
  ) => {
    const response = await axios.post<{
      success: boolean;
      user?: { id: string; username: string; email: string; teamId: string; crmUserId?: string; crmUserRole?: string };
      token?: string;
      refreshToken?: string;
      error?: string;
    }>(`${MESSENGERS_API_URL}/auth/login`, { email, password, ...demo });
    return response.data;
  },

  syncTeam: async (teamId: string) => {
    const response = await api.post<{
      success: boolean;
      teamId?: string;
      token?: string;
      refreshToken?: string;
    }>('/auth/sync-team', { teamId });
    return response.data;
  },

  getChatProfile: async () => {
    const response = await api.get<{
      success: boolean;
      user: { personalPhoneNumber?: string; personalTelegramUsername?: string };
    }>('/auth/me');
    return response.data;
  },

  updateChatProfile: async (data: {
    personalPhoneNumber?: string;
    personalTelegramUsername?: string;
  }) => {
    const response = await api.patch<{
      success: boolean;
      personalPhoneNumber: string;
      personalTelegramUsername: string;
    }>('/auth/chat-profile', data);
    return response.data;
  },

  getAgreementStatus: async () => {
    const response = await api.get<{ success: boolean; agreedToTerms: boolean; agreedToTermsAt?: string }>('/auth/agreement');
    return response.data;
  },

  updateAgreementStatus: async (agreedToTerms: boolean) => {
    const response = await api.post<{ success: boolean; agreedToTerms: boolean; agreedToTermsAt?: string }>('/auth/agreement', { agreedToTerms });
    return response.data;
  },
  
  refreshAuth: async () => {
    const userData = localStorage.getItem('user_data');
    if (userData) {
      // TODO: implement token refresh logic
    }
  },

  saveCrmCredentials: async (email: string, password: string) => {
    const response = await api.post<{
      success: boolean;
      crmUserId?: string;
      crmUserRole?: string;
      crmTokenExpiry?: string;
      error?: string;
    }>(
      '/auth/crm-credentials',
      { email, password }
    );
    return response.data;
  },

  getCrmStatus: async () => {
    const response = await api.get<{
      success: boolean;
      hasCrmCredentials: boolean;
      crmConnected: boolean;
      crmUserId?: string;
      crmUserRole?: string;
      crmTokenExpiry?: string;
    }>('/auth/crm-status');
    return response.data;
  },

  linkCrmLead: async (dialogId: string, data: { leadId: string; leadStage: string }) => {
    const response = await api.post<{ success: boolean; dialogId?: string; crmLeadId?: string; crmLeadStage?: string; error?: string }>(
      `/dialogs/${dialogId}/crm-linked`,
      data
    );
    return response.data;
  },

  syncCrm: async (dialogId: string) => {
    const response = await api.post<{
      success: boolean;
      dialogId: string;
      actions: string[];
      analysis?: {
        action: string;
        currentStage: string;
        crmLeadId?: string;
        confidence: number;
        recommendation: string;
        clientSummary: string;
        missingFields?: string[];
      };
      error?: string;
    }>(`/dialogs/${dialogId}/crm-sync`);
    return response.data;
  },

  deleteCrmCredentials: async () => {
    const response = await api.delete<{ success: boolean; error?: string }>(
      '/auth/crm-credentials'
    );
    return response.data;
  },

  crmGetLead: async (leadId: string) => {
    const response = await api.get<{ success: boolean; data?: { _id: string; name: string; phone: string; email?: string; city?: string; stage: string; productType: string; source?: string; notes?: string; dealValue: number; tags?: string[]; [k: string]: unknown } }>(
      `/crm/leads/${leadId}`
    );
    return response.data;
  },

  crmMoveLeadStage: async (leadId: string, stage: string, comment?: string) => {
    const body: Record<string, unknown> = { stage };
    if (comment) body.comment = comment;
    const response = await api.patch<{ success: boolean; data?: { stage: string; [k: string]: unknown }; message?: string }>(
      `/crm/leads/${leadId}/stage`, body
    );
    return response.data;
  },

  crmAddLeadHistory: async (leadId: string, message: string, comment?: string) => {
    const body: Record<string, unknown> = { message };
    if (comment) body.comment = comment;
    const response = await api.post<{ success: boolean; message?: string }>(
      `/crm/leads/${leadId}/history`, body
    );
    return response.data;
  },

  crmUpdateLead: async (leadId: string, data: Record<string, unknown>) => {
    const response = await api.patch<{ success: boolean; data?: { stage: string; [k: string]: unknown }; message?: string }>(
      `/crm/leads/${leadId}`, data
    );
    return response.data;
  },

  getAiHistory: async (dialogId: string, limit?: number, offset?: number): Promise<AiHistoryResponse> => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const query = params.toString();
    const response = await api.get<AiHistoryResponse>(`/dialogs/${dialogId}/ai-history${query ? `?${query}` : ''}`);
    return response.data;
  },

  markAiHistoryRead: async (dialogId: string, date?: string): Promise<void> => {
    await api.post(`/dialogs/${dialogId}/ai-history/read`, { date });
  },

  markAllAiHistoryRead: async (dialogId: string): Promise<void> => {
    await api.post(`/dialogs/${dialogId}/ai-history/read-all`);
  },

  getAiHistoryUnreadCount: async (dialogId: string): Promise<number> => {
    const response = await api.get<{ success: boolean; unreadCount: number }>(`/dialogs/${dialogId}/ai-history/unread-count`);
    return response.data.unreadCount;
  },

  getOwnerAiChat: async (dialogId: string, limit?: number, offset?: number): Promise<OwnerAiChatResponse> => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const query = params.toString();
    const response = await api.get<OwnerAiChatResponse>(`/dialogs/${dialogId}/owner-ai-chat${query ? `?${query}` : ''}`);
    return response.data;
  },

  sendOwnerAiChatMessage: async (dialogId: string, text: string): Promise<OwnerAiChatResponse> => {
    const response = await api.post<OwnerAiChatResponse>(`/dialogs/${dialogId}/owner-ai-chat`, { text });
    return response.data;
  },

  // ── AI Permissions ──────────────────────────────────────────

  getAiPermissions: async () => {
    const response = await api.get<AiPermissionsResponse>('/ai-permissions');
    return response.data;
  },

  updateAiPermissionsGeneral: async (permissions: Partial<AiPermissionsMap>) => {
    const response = await api.put<AiPermissionsResponse>('/ai-permissions/general', permissions);
    return response.data;
  },

  updateAiPermissionsDialog: async (dialogId: string, permissions: Partial<AiPermissionsMap>) => {
    const response = await api.put<AiPermissionsResponse>(`/ai-permissions/dialog/${dialogId}`, permissions);
    return response.data;
  },

  applyAiPermissionsToAll: async () => {
    const response = await api.post<{ success: boolean; data: { updated: number } }>('/ai-permissions/apply-to-all', {});
    return response.data;
  },

  getAiPermissionsEffective: async (dialogId: string) => {
    const response = await api.get<{ success: boolean; data: AiPermissionsMap }>(`/ai-permissions/dialog/${dialogId}/effective`);
    return response.data;
  },

  getAiActionRequests: async () => {
    const response = await api.get<{ success: boolean; data: AiActionRequest[] }>('/ai-action-requests');
    return response.data;
  },

  approveAiActionRequest: async (id: string) => {
    const response = await api.post<{ success: boolean; data: { approved: boolean } } | { success: false; error: string }>(`/ai-action-requests/${id}/approve`);
    return response.data;
  },

  rejectAiActionRequest: async (id: string) => {
    const response = await api.post<{ success: boolean; data: { rejected: boolean } }>(`/ai-action-requests/${id}/reject`);
    return response.data;
  },

  getAiActionLogs: async (dialogId?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (dialogId) params.set('dialogId', dialogId);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const query = params.toString();
    const response = await api.get<{ success: boolean; data: AiActionLog[] }>(`/ai-action-requests/logs${query ? `?${query}` : ''}`);
    return response.data;
  },
};

// ── AI Permissions Types ──────────────────────────────────────

export type AiPermissionKey =
  | 'fill_name' | 'fill_phone' | 'fill_budget' | 'deal_value' | 'fill_deal_type'
  | 'move_stage' | 'create_task'
  | 'fill_email' | 'fill_city' | 'fill_object_type' | 'fill_telegram' | 'fill_country'
  | 'source' | 'add_history' | 'add_comment' | 'sync_notes' | 'create_lead' | 'link_lead'

export type AiPermissionsMap = Record<AiPermissionKey, boolean>

export interface AiPermissionsResponse {
  success: boolean
  data: {
    general: AiPermissionsMap
    dialogOverrides: Array<{ dialogId: string; overrides: Partial<AiPermissionsMap> }>
    labels: Record<AiPermissionKey, string>
    requiredActions: AiPermissionKey[]
  }
}

export type AiActionRequestStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired' | 'obsolete' | 'cancelled' | 'auto_cancelled'

export interface AiActionRequest {
  _id: string
  dialogId: string
  action: AiPermissionKey
  actionLabel: string
  payload: Record<string, unknown>
  currentData: Record<string, unknown>
  status: AiActionRequestStatus
  expiresAt: string
  createdAt: string
  isExpired: boolean
  cancelledReason: string | null
}

export interface AiActionLog {
  _id: string
  userId: string
  dialogId: string
  action: AiPermissionKey
  status: AiActionRequestStatus
  payload: Record<string, unknown>
  details: string
  createdAt: string
}

// ── AI Self-Tasks Types ─────────────────────────────────────

export type SelfTaskType =
  | 'follow_up_no_response'
  | 'check_reaction'
  | 'warmup_guide'
  | 'clarify_status'
  | 'update_profile'
  | 'next_recommendation'
  | 'silence_control'
  | 'price_drop_alert'
  | 'new_match_notification'
  | 'document_reminder'
  | 'viewing_feedback'
  | 'market_update'
  | 'birthday_greeting'
  | 'seasonal_tip'
  | 'objection_handling'
  | 'competitor_check'
  | 'deal_momentum'

export type SelfTaskStatus = 'scheduled' | 'in_progress' | 'completed' | 'paused' | 'cancelled'

export type SelfTaskPriority = 'high' | 'medium' | 'low'

export type RecurringInterval = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface IExecutionRecord {
  executedAt: string
  status: 'success' | 'failed' | 'skipped'
  message?: string
  error?: string
  duration?: number
}

export interface IAiSelfTask {
  _id: string
  dialogId: string
  userId: string
  teamId: string
  type: SelfTaskType
  priority: SelfTaskPriority
  title: string
  description?: string
  triggerEvent?: string
  status: SelfTaskStatus
  executeAt: string
  executedAt?: string
  recurring: boolean
  recurringInterval?: RecurringInterval
  recurringDays?: number[]
  createdBy: 'ai' | 'human'
  executionHistory: IExecutionRecord[]
  createdAt: string
  updatedAt: string
}

export interface SelfTaskStats {
  total: number
  byStatus: Record<SelfTaskStatus, number>
  byType: Record<string, number>
  overdue: number
}

export interface CreateSelfTaskDto {
  type: SelfTaskType
  title: string
  priority?: SelfTaskPriority
  description?: string
  executeAt: string
  recurring?: boolean
  recurringInterval?: RecurringInterval
  recurringDays?: number[]
}

export interface UpdateSelfTaskDto {
  type?: SelfTaskType
  title?: string
  priority?: SelfTaskPriority
  description?: string
  executeAt?: string
  status?: SelfTaskStatus
  recurring?: boolean
  recurringInterval?: RecurringInterval
  recurringDays?: number[]
}

export const SELF_TASK_TYPE_LABELS: Record<SelfTaskType, string> = {
  follow_up_no_response: 'Follow-up при молчании',
  check_reaction: 'Проверка реакции на объект',
  warmup_guide: 'Прогрев гайдом',
  clarify_status: 'Уточнение статуса клиента',
  update_profile: 'Обновление профиля',
  next_recommendation: 'Следующая рекомендация',
  silence_control: 'Контроль молчания',
  price_drop_alert: 'Снижение цены',
  new_match_notification: 'Новый подходящий объект',
  document_reminder: 'Напоминание про документы',
  viewing_feedback: 'Обратная связь после показа',
  market_update: 'Обзор рынка',
  birthday_greeting: 'Поздравление',
  seasonal_tip: 'Сезонный совет',
  objection_handling: 'Работа с возражением',
  competitor_check: 'Проверка конкурента',
  deal_momentum: 'Динамика сделки',
}

export const SELF_TASK_STATUS_LABELS: Record<SelfTaskStatus, string> = {
  scheduled: 'Запланирована',
  in_progress: 'В работе',
  completed: 'Выполнена',
  paused: 'На паузе',
  cancelled: 'Отменена',
}

export const SELF_TASK_PRIORITY_LABELS: Record<SelfTaskPriority, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
}

export const SELF_TASK_STATUS_COLORS: Record<SelfTaskStatus, string> = {
  scheduled: '#f59e0b',
  in_progress: '#3b82f6',
  completed: '#10b981',
  paused: '#6b7280',
  cancelled: '#ef4444',
}

export const SELF_TASK_PRIORITY_COLORS: Record<SelfTaskPriority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
}

export const selfTaskApi = {
  async getTasks(dialogId: string, params?: { status?: string; type?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.type) query.set('type', params.type)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    const res = await api.get<{ success: boolean; data: { tasks: IAiSelfTask[]; total: number; hasMore: boolean } }>(
      `/dialogs/${dialogId}/self-tasks${qs ? `?${qs}` : ''}`
    )
    return res.data
  },

  async getTask(taskId: string) {
    const res = await api.get<{ success: boolean; data: IAiSelfTask }>(`/self-tasks/${taskId}`)
    return res.data
  },

  async createTask(dialogId: string, data: CreateSelfTaskDto) {
    const res = await api.post<{ success: boolean; data: IAiSelfTask }>(`/dialogs/${dialogId}/self-tasks`, data)
    return res.data
  },

  async updateTask(taskId: string, data: UpdateSelfTaskDto) {
    const res = await api.patch<{ success: boolean; data: IAiSelfTask }>(`/self-tasks/${taskId}`, data)
    return res.data
  },

  async deleteTask(taskId: string) {
    const res = await api.delete<{ success: boolean; data: { deleted: boolean } }>(`/self-tasks/${taskId}`)
    return res.data
  },

  async pauseTask(taskId: string) {
    const res = await api.post<{ success: boolean; data: IAiSelfTask }>(`/self-tasks/${taskId}/pause`)
    return res.data
  },

  async resumeTask(taskId: string) {
    const res = await api.post<{ success: boolean; data: IAiSelfTask }>(`/self-tasks/${taskId}/resume`)
    return res.data
  },

  async executeNow(taskId: string) {
    const res = await api.post<{ success: boolean; data: { executed: boolean } }>(`/self-tasks/${taskId}/execute-now`)
    return res.data
  },

  async getHistory(taskId: string, params?: { limit?: number; offset?: number }) {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    const res = await api.get<{ success: boolean; data: { history: IExecutionRecord[]; total: number } }>(
      `/self-tasks/${taskId}/history${qs ? `?${qs}` : ''}`
    )
    return res.data
  },

  async getStats(dialogId?: string) {
    const qs = dialogId ? `?dialogId=${dialogId}` : ''
    const res = await api.get<{ success: boolean; data: SelfTaskStats }>(`/self-tasks/stats${qs}`)
    return res.data
  },
}
