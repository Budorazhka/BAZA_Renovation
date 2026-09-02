// ============================================================================
// MESSENGER → CRM ACTION SPEC
// ============================================================================
// Полный файл-спецификация для мессенджер-бэкенда.
// Содержит: типы действий, payload-ы, все enum-значения, эндпоинты CRM API,
// форматы запрос/ответ, и как фронт собирает данные для отправки.
//
// CRM API base:  https://api-crm.baza.sale  (prod) / http://localhost:3000 (dev)
// MSGR API base: https://api-msngrs.baza.sale/api (prod) / http://localhost:3001/api (dev)
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// §1. АВТОРИЗАЦИЯ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Два независимых JWT-токена:
 *   - crmToken  → для CRM API  (хранится как `jwt_token` в localStorage)
 *   - msgrToken → для MSGR API (хранится как `msgr_jwt_token` в localStorage)
 *
 * При входе фронт делает два POST:
 *   1. POST {CRM}/auth/login-direct   { email, password }
 *      → { user, token, refreshToken }
 *   2. POST {MSGR}/auth/login         { email, password }
 *      → { token, refreshToken }
 */

/** Данные, которые фронт отправляет мессенджер-бэкенду в каждом запросе */
export interface MessengerCrmAuthContext {
  /** JWT токен для CRM API (из localStorage `jwt_token`) */
  crmToken: string;

  /** User ID (из localStorage `user_data.id`) */
  userId: string;

  /** Роль пользователя в CRM (из localStorage `user_data.role`) */
  userRole: CrmUserRole;

  /** Email пользователя (из JWT payload или localStorage `user_email`) */
  email?: string;
}

/** Как фронт собирает authContext (src/features/crm/services/api/client.ts:299-330) */
export function buildAuthContext(): MessengerCrmAuthContext {
  const crmToken = localStorage.getItem('jwt_token') || '';
  const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
  const email = localStorage.getItem('user_email') || '';

  return {
    crmToken,
    userId: userData.id || '',
    userRole: userData.role || 'agent',
    email,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2. ENUMS — все допустимые значения
// ─────────────────────────────────────────────────────────────────────────────

/** Роль пользователя в CRM API (отличается от UserRole в приложении!) */
export type CrmUserRole = 'agent' | 'mentor' | 'manager' | 'admin';

/**
 * Mapping из UserRole приложения → CrmUserRole для CRM API.
 * Источник: src/features/crm/services/api/client.ts:316-317
 */
export const APP_TO_CRM_ROLE: Record<string, CrmUserRole> = {
  owner: 'admin',
  director: 'admin',
  rop: 'manager',
  manager: 'manager',
  marketer: 'agent',
  lawyer: 'agent',
  procurement_head: 'manager',
  administrator: 'manager',
  trainee: 'agent',
  finance: 'agent',
  developer: 'admin',  // ← ключевое: developer → admin
  hr: 'manager',
  partner: 'agent',
};

/** Тип продукта (воронки) */
export type ProductType = 'sales' | 'network' | 'owner' | 'agent';

/** Валюта бюджета */
export type BudgetCurrency = 'USD' | 'EUR' | 'RUB' | 'KZT';

/** Приоритет задачи */
export type TaskPriority =
  | 'urgent_important'
  | 'not_urgent_important'
  | 'urgent_not_important'
  | 'not_urgent_not_important';

/** Статус задачи */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Все этапы воронки лида (50+ значений).
 * Источник: src/features/crm/services/api/types.ts:44-126
 */
export type LeadStage =
  // ── Продажи (22 этапа) ──
  | 'rejected'
  | 'first_contact'
  | 'qualification'
  | 'rejected1'
  | 'first_contact1'
  | 'needs_analysis'
  | 'presentation'
  | 'proposal'
  | 'negotiation'
  | 'decision_making'
  | 'contract_signing'
  | 'onboarding'
  | 'needs_analysis1'
  | 'presentation1'
  | 'proposal1'
  | 'negotiation1'
  | 'decision_making1'
  | 'contract_signing1'
  | 'deal_closed'
  | 'post_purchase_followup'
  | 'satisfaction_check'
  | 'upsell_opportunity'
  // ── Регистрация/адаптация ──
  | 'registered'
  | 'adapted'
  // ── Сеть (16 этапов) ──
  | 'network_rejected_defective'
  | 'network_rejected'
  | 'network_no_call_3'
  | 'network_no_call_2'
  | 'network_no_call_1'
  | 'network_new_lead'
  | 'network_call_later'
  | 'network_company_presented'
  | 'network_platform_presented'
  | 'network_offer_given'
  | 'network_objections'
  | 'network_deferred_demand'
  | 'network_agreement'
  | 'network_form_filled'
  | 'network_account_registered'
  | 'network_offer_signed'
  | 'network_work_started'
  // ── Риэлтор (6 этапов) ──
  | 'realtor_1'
  | 'realtor_2'
  | 'realtor_3'
  | 'realtor_4'
  | 'realtor_5'
  | 'realtor_6'
  // ── Куратор (6 этапов) ──
  | 'curator_1'
  | 'curator_2'
  | 'curator_3'
  | 'curator_4'
  | 'curator_5'
  | 'curator_6'
  // ── Собственник (13 этапов) ──
  | 'owner_rejected_defective'
  | 'owner_rejected_owner'
  | 'owner_no_call_3'
  | 'owner_no_call_2'
  | 'owner_no_call_1'
  | 'owner_new_owner'
  | 'owner_call_later'
  | 'owner_company_presented'
  | 'owner_object_discussed'
  | 'owner_photo_proposed'
  | 'owner_exclusive_proposed'
  | 'owner_objections'
  | 'owner_agreed'
  | 'owner_active_for_sale'
  | 'owner_get_referral'
  | 'owner_new_object_inquiry'
  // ── Посредник (11 этапов) ──
  | 'agent_rejected_defective'
  | 'agent_rejected'
  | 'agent_no_call_3'
  | 'agent_no_call_2'
  | 'agent_no_call_1'
  | 'agent_new_agent'
  | 'agent_call_later'
  | 'agent_company_presented'
  | 'agent_format'
  | 'agent_objections'
  | 'agent_agreed'
  | 'agent_active';

/** Причины отказа */
export type RejectionReason =
  | 'price_too_high'
  | 'not_interested'
  | 'wrong_timing'
  | 'competitor_chosen'
  | 'no_budget'
  | 'no_authority'
  | 'other'
  | 'defective_lead'
  | 'other_reason'
  | 'partnership_terminated'
  | 'cannot_contact';

// ─────────────────────────────────────────────────────────────────────────────
// §3. ТИПЫ ДЕЙСТВИЙ И PAYLOAD-Ы
// ─────────────────────────────────────────────────────────────────────────────

/** Варианты действий, которые мессенджер-бэкенд может выполнить в CRM */
export type CrmAction =
  // ── Лиды ──
  | 'lead.move_stage'
  | 'lead.create'
  | 'lead.update'
  | 'lead.assign'
  | 'lead.add_history'
  | 'lead.record_contact'
  | 'lead.get_by_phone'
  | 'lead.get_by_email'
  | 'lead.get_by_id'
  | 'lead.list'
  // ── Описание лида ──
  | 'lead.update_notes'
  // ── Задачи ──
  | 'task.create'
  | 'task.update'
  | 'task.list'
  | 'task.get'
  // ── Календарь ──
  | 'calendar.create_event'
  | 'calendar.update_event'
  | 'calendar.get_events'
  // ── Массовые операции ──
  | 'leads.bulk_assign'
  // ── Аналитика ──
  | 'analytics.leads_by_stage'
  | 'analytics.leads_by_stage_by_email';

/** Обёртка запроса от фронта к мессенджер-бэкенду */
export interface MessengerCrmRequest {
  auth: MessengerCrmAuthContext;
  action: CrmAction;
  payload: Record<string, unknown>;
}

// ─── 3.1. ЛИДЫ ──────────────────────────────────────────────────────────────

/** Перемещение лида по воронке */
export interface MoveLeadStagePayload {
  /** MongoDB ObjectId лида (24 hex chars) */
  leadId: string;
  /** Новый этап воронки */
  stage?: LeadStage;
  /** Этап риэлтора (дополнительно) */
  realtorStage?: LeadStage;
  /** Этап куратора (дополнительно) */
  curatorStage?: LeadStage;
  /** Комментарий к переходу */
  comment?: string;
  /** Причина отказа (при переходе на rejected-этапы) */
  rejectionReason?: RejectionReason;
  /** Комментарий отказа */
  rejectionComment?: string;
}
// → CRM API: PATCH /crm/leads/{leadId}/stage
// Тело: { stage, realtorStage?, curatorStage?, comment?, rejectionReason?, rejectionComment? }
// Query params: ?userId={userId}&userRole={userRole}

/** Создание лида */
export interface CreateLeadPayload {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  productType: ProductType;
  /** userId менеджера, которому назначается лид */
  assignedTo: string;
  /** Источник (например 'telegram', 'whatsapp', 'referral') */
  source?: string;
  notes?: string;
  dealValue?: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: BudgetCurrency;
}
// → CRM API: POST /crm/leads
// Тело: { name, phone, email?, city?, productType, assignedTo, source?, notes?, dealValue?, expectedCloseDate?, budgetValue?, budgetCurrency? }
// Query params: ?userId={userId}&userRole={userRole}

/** Обновление данных лида */
export interface UpdateLeadPayload {
  leadId: string;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  stage?: LeadStage;
  productType?: ProductType;
  realtorStage?: LeadStage;
  curatorStage?: LeadStage;
  assignedTo?: string;
  source?: string;
  notes?: string;
  rejectionReason?: RejectionReason;
  rejectionComment?: string;
  dealValue?: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: BudgetCurrency;
  tags?: string[];
}
// → CRM API: PATCH /crm/leads/{leadId}
// Тело: только переданные поля (sanitized на бэкенде)
// Query params: ?userId={userId}&userRole={userRole}

/** Переназначение лида другому менеджеру */
export interface AssignLeadPayload {
  leadId: string;
  assignedTo: string;  // userId нового менеджера
}
// → CRM API: PATCH /crm/leads/{leadId}  { assignedTo }
// Query params: ?userId={userId}&userRole={userRole}

/** Добавление записи в историю лида */
export interface AddLeadHistoryPayload {
  leadId: string;
  message: string;
  comment?: string;
}
// → CRM API: POST /crm/leads/{leadId}/history
// Тело: { message, comment? }
// Query params: ?userId={userId}&userRole={userRole}

/** Фиксация контакта (звонок или чат) */
export interface RecordLeadContactPayload {
  leadId: string;
  type: 'call' | 'chat';
}
// → CRM API: POST /crm/leads/{leadId}/contact-action
// Тело: { type }
// Query params: ?userId={userId}&userRole={userRole}

/** Поиск лида по телефону */
export interface GetLeadByPhonePayload {
  phone: string;
}
// → CRM API: GET /crm/leads?search={phone}&userId={userId}&userRole={userRole}

/** Поиск лида по email */
export interface GetLeadByEmailPayload {
  email: string;
}
// → CRM API: GET /crm/leads?search={email}&userId={userId}&userRole={userRole}

/** Получение лида по ID */
export interface GetLeadByIdPayload {
  leadId: string;
}
// → CRM API: GET /crm/leads/{leadId}?userId={userId}&userRole={userRole}

/** Список лидов с фильтрами */
export interface ListLeadsPayload {
  page?: number;
  limit?: number;
  stage?: LeadStage;
  productType?: ProductType;
  assignedTo?: string;
  source?: string;
  search?: string;
}
// → CRM API: GET /crm/leads?{params}&userId={userId}&userRole={userRole}

// ─── 3.1.1. ЗАМЕТКИ ─────────────────────────────────────────────────────────

/** Обновление описания (заметок) лида — поле `notes` в карточке лида */
export interface UpdateLeadNotesPayload {
  /** ID лида */
  leadId: string;
  /** Новый текст описания. Бэкенд формирует полный текст (дописывает к существующему или заменяет). */
  notes: string;
}
// → CRM API: PATCH /crm/leads/{leadId}
// Тело: { notes }
// Query params: ?userId={userId}&userRole={userRole}

// ─── 3.2. ЗАДАЧИ ────────────────────────────────────────────────────────────

/** Создание задачи */
export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority: TaskPriority;
  startDate?: string;   // ISO date string
  endDate?: string;     // ISO date string
  colorLabel?: string;
  category?: number;
  categories?: string[];
  clientName?: string;
  /** userId ответственного */
  assignedTo: string;
  /** Привязка к лиду (MongoDB ObjectId) */
  leadId?: string;
  subtasks?: Array<{ title: string; completed?: boolean }>;
  syncWithCalendar?: boolean;
}
// → CRM API: POST /tasks
// Тело: { title, description?, priority, startDate?, endDate?, colorLabel?, category?, categories?, clientName?, assignedTo, leadId?, subtasks?, syncWithCalendar? }
// Query params: ?userId={userId}&userRole={userRole}

/** Обновление задачи */
export interface UpdateTaskPayload {
  taskId: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  startDate?: string;
  endDate?: string;
  colorLabel?: string;
  category?: number;
  categories?: string[];
  clientName?: string;
  assignedTo?: string;
  leadId?: string | null;
  subtasks?: Array<{ title: string; completed?: boolean }>;
  syncWithCalendar?: boolean;
}
// → CRM API: PATCH /tasks/{taskId}
// Тело: только переданные поля
// Query params: ?userId={userId}&userRole={userRole}

/** Получение списка задач */
export interface ListTasksPayload {
  page?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  leadId?: string;
}
// → CRM API: GET /tasks?{params}&userId={userId}&userRole={userRole}

/** Получение задачи по ID */
export interface GetTaskPayload {
  taskId: string;
}
// → CRM API: GET /tasks/{taskId}?userId={userId}&userRole={userRole}

// ─── 3.3. КАЛЕНДАРЬ ─────────────────────────────────────────────────────────

export type EventType = 'meeting' | 'call' | 'task' | 'other';
export type EventStatus = 'scheduled' | 'completed' | 'cancelled';

/** Создание события календаря */
export interface CreateCalendarEventPayload {
  title: string;
  description?: string;
  type: EventType;
  startTime: string;   // ISO datetime
  endTime: string;     // ISO datetime
  location?: string;
  leadId?: string;
  taskId?: string;
  isRecurring?: boolean;
  recurrenceRule?: string;
}
// → CRM API: POST /calendar/events
// Query params: ?userId={userId}&userRole={userRole}

/** Обновление события календаря */
export interface UpdateCalendarEventPayload {
  eventId: string;
  title?: string;
  description?: string;
  type?: EventType;
  status?: EventStatus;
  startTime?: string;
  endTime?: string;
  location?: string;
}
// → CRM API: PATCH /calendar/events/{eventId}
// Query params: ?userId={userId}&userRole={userRole}

/** Получение событий календаря */
export interface GetCalendarEventsPayload {
  startDate: string;
  endDate: string;
  type?: EventType;
  userId?: string;
}
// → CRM API: GET /calendar/events/view?startDate=...&endDate=...&type=...&userId=...&userRole=...

// ─── 3.4. МАССОВЫЕ ОПЕРАЦИИ ─────────────────────────────────────────────────

/** Массовая передача лидов от одного менеджера другому */
export interface BulkAssignLeadsPayload {
  fromManagerId: string;
  toManagerId: string;
}
// → CRM API: POST /crm/leads/bulk-assign
// Тело: { fromManagerId, toManagerId }
// Query params: ?userId={userId}&userRole={userRole}

// ─── 3.5. АНАЛИТИКА ─────────────────────────────────────────────────────────

/** Количество лидов по этапам */
export interface LeadsByStagePayload {
  productType?: ProductType;
  assignedTo?: string;
}
// → CRM API: GET /crm/analytics/leads-by-stage?productType=...&assignedTo=...&userId=...&userRole=...

/** Количество лидов по этапам для конкретного пользователя */
export interface LeadsByStageByEmailPayload {
  email: string;
  productType?: ProductType;
}
// → CRM API: GET /crm/analytics/leads-by-stage/by-email?email=...&productType=...&userId=...&userRole=...

// ─────────────────────────────────────────────────────────────────────────────
// §4. ОТВЕТЫ CRM API
// ─────────────────────────────────────────────────────────────────────────────

/** Стандартный ответ CRM API */
export interface CrmApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

/** Обёртка ответа мессенджер-бэкенда */
export interface MessengerCrmResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP статус от CRM API */
  crmStatus?: number;
}

/** Объект лида из CRM */
export interface CrmLead {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  stage: LeadStage;
  productType: ProductType;
  realtorStage?: LeadStage;
  curatorStage?: LeadStage;
  assignedTo: string;
  createdBy: string;
  source?: string;
  notes?: string;
  rejectionReason?: RejectionReason;
  rejectionComment?: string;
  history: Array<{
    fromStage: LeadStage;
    toStage: LeadStage;
    changedAt: string;
    changedBy: string;
    userName: string;
    userRole: string;
    comment?: string;
  }>;
  dealValue: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: BudgetCurrency;
  tags?: string[];
  files?: Array<{
    _id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    folderId?: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

/** Объект задачи из CRM */
export interface CrmTask {
  _id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  colorLabel?: string;
  category?: number;
  categories?: string[];
  clientName?: string;
  assignedTo: string | { _id: string; name: string; email: string };
  createdBy: string | { _id: string; name: string; email: string };
  leadId?: string | { _id: string; name: string; phone: string };
  subtasks?: Array<{ title: string; completed?: boolean }>;
  files?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
  hasFiles?: boolean;
  syncWithCalendar?: boolean;
  calendarEventId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Объект события календаря из CRM */
export interface CrmCalendarEvent {
  _id: string;
  title: string;
  description?: string;
  type: EventType;
  status: EventStatus;
  startTime: string;
  endTime: string;
  location?: string;
  leadId?: string;
  taskId?: string;
  isRecurring?: boolean;
  recurrenceRule?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5. ДАННЫЕ ИЗ AUTHCONTEXT (как фронт собирает данные)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Интерфейс текущего пользователя (src/types/auth.ts:57-81).
 * Используется для наполнения auth-контекста.
 */
export interface CurrentUser {
  id: string;
  name: string;
  login: string;
  role: string;           // UserRole приложения
  accountType: string;    // 'agency' | 'developer' | 'realtor' | 'internal'
  companyId: string;
  companyName: string;
  avatarUrl?: string;
  position?: string;
  phone?: string;
  telegram?: string;
  whatsapp?: string;
  aboutMe?: string;
  aboutCompany?: string;
  skills?: string[];
  city?: string;
  birthDate?: string;
  department?: string;
  vk?: string;
  instagram?: string;
  website?: string;
  permissionOverrides?: Record<string, string>;
}

/** Все роли приложения (src/types/auth.ts:29-40) */
export const APP_USER_ROLES = [
  'owner', 'director', 'rop', 'marketer', 'manager',
  'procurement_head', 'administrator', 'trainee', 'lawyer', 'finance',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// §6. КЛЮЧИ LOCALSTORAGE
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  /** JWT токен CRM API */
  CRM_TOKEN: 'jwt_token',
  /** Refresh токен CRM API */
  CRM_REFRESH_TOKEN: 'refresh_token',
  /** JWT токен Messenger API */
  MSGR_TOKEN: 'msgr_jwt_token',
  /** Refresh токен Messenger API */
  MSGR_REFRESH_TOKEN: 'msgr_refresh_token',
  /** User ID (CRM) */
  USER_ID: 'userId',
  /** User data JSON { id, role } (CRM) */
  USER_DATA: 'user_data',
  /** Текущий пользователь (полный объект CurrentUser) */
  AUTH_USER: 'agency.auth.current-user',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// §7. URL-Ы БЭКЕНДОВ
// ─────────────────────────────────────────────────────────────────────────────

// old one MSGR_PROD: 'https://api-msngrs.baza.sale',
// new one MSGR_PROD: 'https://ai-erp.baza.sale'
// old one SOCKET_PROD: 'https://api-msngrs.baza.sale',
// new one SOCKET_PROD: 'https://ai-erp.baza.sale'
export const BACKEND_URLS = {
  /** CRM API */
  CRM_PROD: 'https://api-crm.baza.sale',
  CRM_DEV: 'http://localhost:3000',
  /** Messenger API */
  MSGR_PROD: 'https://ai-erp.baza.sale',
  MSGR_DEV: 'http://localhost:3001',
  /** Socket.IO */
  SOCKET_PROD: 'https://ai-erp.baza.sale',
  SOCKET_DEV: 'http://localhost:3001',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// §8. ПОЛНАЯ ТАБЛИЦА ДЕЙСТВИЙ → CRM API ЭНДПОИНТОВ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Маппинг: действие → HTTP method + path в CRM API.
 * Мессенджер-бэкенд должен:
 *   1. Принять MessengerCrmRequest
 *   2. Найти эндпоинт по таблице
 *   3. Проксировать запрос с Headers: { Authorization: Bearer {crmToken} }
 *    + Query: { userId, userRole }
 */
export const ACTION_ENDPOINT_MAP: Record<CrmAction, { method: string; path: string }> = {
  // ── Лиды ──
  'lead.move_stage':      { method: 'PATCH',  path: '/crm/leads/{leadId}/stage' },
  'lead.create':          { method: 'POST',   path: '/crm/leads' },
  'lead.update':          { method: 'PATCH',  path: '/crm/leads/{leadId}' },
  'lead.assign':          { method: 'PATCH',  path: '/crm/leads/{leadId}' },
  'lead.add_history':     { method: 'POST',   path: '/crm/leads/{leadId}/history' },
  'lead.record_contact':  { method: 'POST',   path: '/crm/leads/{leadId}/contact-action' },
  'lead.get_by_phone':    { method: 'GET',    path: '/crm/leads' },
  'lead.get_by_email':    { method: 'GET',    path: '/crm/leads' },
  'lead.get_by_id':       { method: 'GET',    path: '/crm/leads/{leadId}' },
  'lead.list':            { method: 'GET',    path: '/crm/leads' },
  // ── Описание лида ──
  'lead.update_notes':    { method: 'PATCH',  path: '/crm/leads/{leadId}' },
  // ── Задачи ──
  'task.create':          { method: 'POST',   path: '/tasks' },
  'task.update':          { method: 'PATCH',  path: '/tasks/{taskId}' },
  'task.list':            { method: 'GET',    path: '/tasks' },
  'task.get':             { method: 'GET',    path: '/tasks/{taskId}' },
  // ── Календарь ──
  'calendar.create_event': { method: 'POST',  path: '/calendar/events' },
  'calendar.update_event': { method: 'PATCH', path: '/calendar/events/{eventId}' },
  'calendar.get_events':  { method: 'GET',    path: '/calendar/events/view' },
  // ── Массовые операции ──
  'leads.bulk_assign':    { method: 'POST',   path: '/crm/leads/bulk-assign' },
  // ── Аналитика ──
  'analytics.leads_by_stage':         { method: 'GET', path: '/crm/analytics/leads-by-stage' },
  'analytics.leads_by_stage_by_email': { method: 'GET', path: '/crm/analytics/leads-by-stage/by-email' },
};

// ─────────────────────────────────────────────────────────────────────────────
// §9. ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Пример: фронт отправляет запрос на перемещение лида
 *
 * ```json
 * {
 *   "auth": {
 *     "crmToken": "eyJhbGciOiJIUzI1NiIs...",
 *     "userId": "690ca643abbceba815ba7090",
 *     "userRole": "manager",
 *     "email": "manager@example.com"
 *   },
 *   "action": "lead.move_stage",
 *   "payload": {
 *     "leadId": "64a1b2c3d4e5f6a7b8c9d0e1",
 *     "stage": "qualification",
 *     "comment": "Первичный контакт состоялся"
 *   }
 * }
 * ```
 *
 * Мессенджер-бэкенд проксирует:
 * ```
 * PATCH https://api-crm.baza.sale/crm/leads/64a1b2c3d4e5f6a7b8c9d0e1/stage
 *   ?userId=690ca643abbceba815ba7090&userRole=manager
 * Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "stage": "qualification", "comment": "Первичный контакт состоялся" }
 * ```
 */

/**
 * Пример: создание лида из чата
 *
 * ```json
 * {
 *   "auth": { "crmToken": "...", "userId": "...", "userRole": "manager" },
 *   "action": "lead.create",
 *   "payload": {
 *     "name": "Иван Иванов",
 *     "phone": "+79991234567",
 *     "email": "ivan@example.com",
 *     "productType": "sales",
 *     "assignedTo": "690ca643abbceba815ba7090",
 *     "source": "telegram",
 *     "notes": "Интересуется 2-комнатной квартирой"
 *   }
 * }
 * ```
 */

/**
 * Пример: поиск лида по телефону из чата
 *
 * ```json
 * {
 *   "auth": { "crmToken": "...", "userId": "...", "userRole": "manager" },
 *   "action": "lead.get_by_phone",
 *   "payload": { "phone": "+79991234567" }
 * }
 * ```
 * Ответ: { success: true, data: { items: [CrmLead, ...], total: N, page: 1, totalPages: 1 } }
 */

/**
 * Пример: обновление полей лида из чата
 *
 * Бэкенд мессенджера определяет, что нужно обновить данные лида
 * (извлёк новый телефон из сообщения, клиент сменил email, и т.д.)
 * и отправляет crm:action_required с action: 'update_lead'.
 *
 * Фронт вызывает PATCH /crm/leads/{leadId} с переданными полями.
 *
 * ```json
 * {
 *   "auth": { "crmToken": "...", "userId": "...", "userRole": "manager" },
 *   "action": "lead.update",
 *   "payload": {
 *     "leadId": "64a1b2c3d4e5f6a7b8c9d0e1",
 *     "phone": "+79991234567",
 *     "email": "ivan@newdomain.com",
 *     "name": "Иван Иванов",
 *     "city": "Москва"
 *   }
 * }
 * ```
 *
 * Мессенджер-бэкенд проксирует:
 * ```
 * PATCH https://api-crm.baza.sale/crm/leads/64a1b2c3d4e5f6a7b8c9d0e1
 *   ?userId=690ca643abbceba815ba7090&userRole=manager
 * Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "phone": "+79991234567", "email": "ivan@newdomain.com", "name": "Иван Иванов", "city": "Москва" }
 * ```
 *
 * Допустимые поля (из UpdateLeadPayload):
 *   name, phone, email, city, stage, productType, realtorStage, curatorStage,
 *   assignedTo, source, notes, rejectionReason, rejectionComment, dealValue,
 *   expectedCloseDate, budgetValue, budgetCurrency, tags, telegram, country
 *
 * Ограничения:
 *   - Обновляются только переданные поля (частичное обновление)
 *   - tags — максимум 2 шт, каждый до 128 символов
 *   - phone/email — проверка на уникальность (409 если дубликат)
 */

// ─────────────────────────────────────────────────────────────────────────────
// §10. ВОРОНКА ПРОДАЖ — ПОРЯДОК ЭТАПОВ
// ─────────────────────────────────────────────────────────────────────────────
//
// Бэкенд мессенджера использует эту таблицу для:
//   1. Определения дефолтного этапа при создании лида (create_lead)
//   2. Корректного порядка отображения этапов в аналитике
//   3. Валидации этапа при move_stage
//   4. Определения, является ли этап «отказным» (rejection)
//
// Воронка продаж — 3 колонки, 22 этапа:
//   «Отказ»     — отказные: брак, отказ, недозвон (5)
//   «В работе»  — активные: от нового лида до заключения договора (13)
//   «Купили»    — успешные: золотой фонд и пост-продажные (4)
//
// order — порядок внутри колонки (1 = начало, чем больше число — тем глубже)
// ─────────────────────────────────────────────────────────────────────────────

export interface FunnelStageDefinition {
  /** Значение LeadStage (ключ в БД) */
  stage: LeadStage;
  /** Отображаемое название на русском */
  label: string;
  /** Колонка воронки */
  column: 'rejection' | 'in_progress' | 'success';
  /** Порядок внутри колонки (1-based) */
  order: number;
  /** Явля ли этап отказным (для аналитики и фильтрации) */
  isRejection: boolean;
}

/**
 * Воронка продаж — единственный контур, с которым работает мессенджер.
 * productType = 'sales'
 */
export const SALES_FUNNEL = {
  productType: 'sales' as const,
  name: 'Продажи',
  /** Дефолтный этап для нового лида — «Новый лид» */
  defaultNewLeadStage: 'needs_analysis' as const,
  defaultNewLeadLabel: 'Новый лид',
  stages: [
    // ── Отказ (rejection) ──────────────────────────────────────────────────
    { stage: 'rejected' as const,         label: 'Бракованный лид',       column: 'rejection' as const,   order: 1, isRejection: true },
    { stage: 'first_contact' as const,    label: 'Отказ',                 column: 'rejection' as const,   order: 2, isRejection: true },
    { stage: 'qualification' as const,    label: 'Не дозвонился 3',       column: 'rejection' as const,   order: 3, isRejection: true },
    { stage: 'rejected1' as const,        label: 'Не дозвонился 2',       column: 'rejection' as const,   order: 4, isRejection: true },
    { stage: 'first_contact1' as const,   label: 'Не дозвонился 1',       column: 'rejection' as const,   order: 5, isRejection: true },
    // ── В работе (in_progress) ─────────────────────────────────────────────
    { stage: 'needs_analysis' as const,   label: 'Новый лид',             column: 'in_progress' as const, order: 1, isRejection: false },
    { stage: 'presentation' as const,     label: 'Попросил связаться позже', column: 'in_progress' as const, order: 2, isRejection: false },
    { stage: 'proposal' as const,         label: 'Презентовали компанию', column: 'in_progress' as const, order: 3, isRejection: false },
    { stage: 'negotiation' as const,      label: 'Обсудили ситуацию в стране', column: 'in_progress' as const, order: 4, isRejection: false },
    { stage: 'decision_making' as const,  label: 'Выявлена потребность',  column: 'in_progress' as const, order: 5, isRejection: false },
    { stage: 'contract_signing' as const, label: 'Потребность скорректирована', column: 'in_progress' as const, order: 6, isRejection: false },
    { stage: 'onboarding' as const,       label: 'Отправлено КП',         column: 'in_progress' as const, order: 7, isRejection: false },
    { stage: 'needs_analysis1' as const,  label: 'Отработка возражений',  column: 'in_progress' as const, order: 8, isRejection: false },
    { stage: 'presentation1' as const,    label: 'Отложенный спрос',      column: 'in_progress' as const, order: 9, isRejection: false },
    { stage: 'proposal1' as const,        label: 'Прогрев',               column: 'in_progress' as const, order: 10, isRejection: false },
    { stage: 'negotiation1' as const,     label: 'Показ',                 column: 'in_progress' as const, order: 11, isRejection: false },
    { stage: 'decision_making1' as const, label: 'Задаток получен',       column: 'in_progress' as const, order: 12, isRejection: false },
    { stage: 'contract_signing1' as const, label: 'Заключен договор',     column: 'in_progress' as const, order: 13, isRejection: false },
    // ── Купили (success) ───────────────────────────────────────────────────
    { stage: 'deal_closed' as const,             label: 'Золотой фонд',                     column: 'success' as const, order: 1, isRejection: false },
    { stage: 'post_purchase_followup' as const,  label: 'Узнал как дела',                   column: 'success' as const, order: 2, isRejection: false },
    { stage: 'satisfaction_check' as const,      label: 'Взять рекомендацию',               column: 'success' as const, order: 3, isRejection: false },
    { stage: 'upsell_opportunity' as const,      label: 'Выявление потребности о новых сделках', column: 'success' as const, order: 4, isRejection: false },
  ],
};

/** Отказные этапы продаж (быстрая проверка без воронки) */
const SALES_REJECTION_STAGES: readonly string[] = [
  'rejected', 'first_contact', 'qualification', 'rejected1', 'first_contact1',
];

/**
 * Получить дефолтный этап для нового лида.
 * Для продаж — всегда 'needs_analysis' ("Новый лид").
 */
export function getDefaultStageForNewLead(): LeadStage {
  return SALES_FUNNEL.defaultNewLeadStage;
}

/**
 * Проверить, является ли этап отказным (только для продаж).
 *
 * ```ts
 * isRejectionStage('first_contact')  // true  — это «Отказ»
 * isRejectionStage('needs_analysis') // false — это «Новый лид»
 * ```
 */
export function isRejectionStage(stage: LeadStage): boolean {
  return SALES_REJECTION_STAGES.includes(stage);
}

/**
 * Валидация этапа: допустим ли он в воронке продаж.
 *
 * ```ts
 * isValidSalesStage('needs_analysis')   // true
 * isValidSalesStage('network_new_lead') // false — это воронка сети
 * ```
 */
export function isValidSalesStage(stage: string): boolean {
  return SALES_FUNNEL.stages.some((s) => s.stage === stage);
}

/**
 * Следующий этап в воронке (для автоперехода ИИ).
 * Возвращает null если текущий этап — последний в воронке.
 *
 * ```ts
 * getNextSalesStage('needs_analysis')  // 'presentation' — «Попросил связаться позже»
 * getNextSalesStage('contract_signing1') // null — последний перед «Купили»
 * ```
 */
export function getNextSalesStage(currentStage: LeadStage): LeadStage | null {
  const idx = SALES_FUNNEL.stages.findIndex((s) => s.stage === currentStage);
  if (idx === -1 || idx >= SALES_FUNNEL.stages.length - 1) return null;
  return SALES_FUNNEL.stages[idx + 1].stage;
}

/**
 * Колонка воронки для этапа продаж.
 *
 * ```ts
 * getSalesStageColumn('needs_analysis') // 'in_progress'
 * getSalesStageColumn('rejected')       // 'rejection'
 * getSalesStageColumn('deal_closed')    // 'success'
 * ```
 */
export function getSalesStageColumn(stage: LeadStage): string | null {
  const found = SALES_FUNNEL.stages.find((s) => s.stage === stage);
  return found?.column ?? null;
}

/**
 * Получить русское название этапа по ключу.
 *
 * ```ts
 * getSalesStageLabel('needs_analysis') // 'Новый лид'
 * getSalesStageLabel('first_contact')  // 'Отказ'
 * ```
 */
export function getSalesStageLabel(stage: LeadStage): string {
  const found = SALES_FUNNEL.stages.find((s) => s.stage === stage);
  return found?.label ?? stage;
}
