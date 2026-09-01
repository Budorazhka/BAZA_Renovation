// Shared types and enums

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export enum UserRole {
  AGENT = 'agent',
  MENTOR = 'mentor',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

export enum ProductType {
  SALES = 'sales',
  NETWORK = 'network',
  OWNER = 'owner',
  AGENT = 'agent',
}

export enum TaskPriority {
  URGENT_IMPORTANT = 'urgent_important',
  NOT_URGENT_IMPORTANT = 'not_urgent_important',
  URGENT_NOT_IMPORTANT = 'urgent_not_important',
  NOT_URGENT_NOT_IMPORTANT = 'not_urgent_not_important',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum LeadStage {
  REJECTED = 'rejected',
  FIRST_CONTACT = 'first_contact',
  QUALIFICATION = 'qualification',
  REJECTED1 = 'rejected1',
  FIRST_CONTACT1 = 'first_contact1',
  NEEDS_ANALYSIS = 'needs_analysis',
  PRESENTATION = 'presentation',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  DECISION_MAKING = 'decision_making',
  CONTRACT_SIGNING = 'contract_signing',
  ONBOARDING = 'onboarding',
  NEEDS_ANALYSIS1 = 'needs_analysis1',
  PRESENTATION1 = 'presentation1',
  PROPOSAL1 = 'proposal1',
  NEGOTIATION1 = 'negotiation1',
  DECISION_MAKING1 = 'decision_making1',
  CONTRACT_SIGNING1 = 'contract_signing1',
  DEAL_CLOSED = 'deal_closed',
  POST_PURCHASE_FOLLOWUP = 'post_purchase_followup',
  SATISFACTION_CHECK = 'satisfaction_check',
  UPSELL_OPPORTUNITY = 'upsell_opportunity',
  REGISTERED = 'registered',
  ADAPTED = 'adapted',
  NETWORK_REJECTED_DEFECTIVE = 'network_rejected_defective',
  NETWORK_REJECTED = 'network_rejected',
  NETWORK_NO_CALL_3 = 'network_no_call_3',
  NETWORK_NO_CALL_2 = 'network_no_call_2',
  NETWORK_NO_CALL_1 = 'network_no_call_1',
  NETWORK_NEW_LEAD = 'network_new_lead',
  NETWORK_CALL_LATER = 'network_call_later',
  NETWORK_COMPANY_PRESENTED = 'network_company_presented',
  NETWORK_PLATFORM_PRESENTED = 'network_platform_presented',
  NETWORK_OFFER_GIVEN = 'network_offer_given',
  NETWORK_OBJECTIONS = 'network_objections',
  NETWORK_DEFERRED_DEMAND = 'network_deferred_demand',
  NETWORK_AGREEMENT = 'network_agreement',
  NETWORK_FORM_FILLED = 'network_form_filled',
  NETWORK_ACCOUNT_REGISTERED = 'network_account_registered',
  NETWORK_OFFER_SIGNED = 'network_offer_signed',
  NETWORK_WORK_STARTED = 'network_work_started',
  REALTOR_1 = 'realtor_1',
  REALTOR_2 = 'realtor_2',
  REALTOR_3 = 'realtor_3',
  REALTOR_4 = 'realtor_4',
  REALTOR_5 = 'realtor_5',
  REALTOR_6 = 'realtor_6',
  CURATOR_1 = 'curator_1',
  CURATOR_2 = 'curator_2',
  CURATOR_3 = 'curator_3',
  CURATOR_4 = 'curator_4',
  CURATOR_5 = 'curator_5',
  CURATOR_6 = 'curator_6',
  OWNER_REJECTED_DEFECTIVE = 'owner_rejected_defective',
  OWNER_REJECTED_OWNER = 'owner_rejected_owner',
  OWNER_NO_CALL_3 = 'owner_no_call_3',
  OWNER_NO_CALL_2 = 'owner_no_call_2',
  OWNER_NO_CALL_1 = 'owner_no_call_1',
  OWNER_NEW_OWNER = 'owner_new_owner',
  OWNER_CALL_LATER = 'owner_call_later',
  OWNER_COMPANY_PRESENTED = 'owner_company_presented',
  OWNER_OBJECT_DISCUSSED = 'owner_object_discussed',
  OWNER_PHOTO_PROPOSED = 'owner_photo_proposed',
  OWNER_EXCLUSIVE_PROPOSED = 'owner_exclusive_proposed',
  OWNER_OBJECTIONS = 'owner_objections',
  OWNER_AGREED = 'owner_agreed',
  OWNER_ACTIVE_FOR_SALE = 'owner_active_for_sale',
  OWNER_GET_REFERRAL = 'owner_get_referral',
  OWNER_NEW_OBJECT_INQUIRY = 'owner_new_object_inquiry',
  AGENT_REJECTED_DEFECTIVE = 'agent_rejected_defective',
  AGENT_REJECTED = 'agent_rejected',
  AGENT_NO_CALL_3 = 'agent_no_call_3',
  AGENT_NO_CALL_2 = 'agent_no_call_2',
  AGENT_NO_CALL_1 = 'agent_no_call_1',
  AGENT_NEW_AGENT = 'agent_new_agent',
  AGENT_CALL_LATER = 'agent_call_later',
  AGENT_COMPANY_PRESENTED = 'agent_company_presented',
  AGENT_FORMAT = 'agent_format',
  AGENT_OBJECTIONS = 'agent_objections',
  AGENT_AGREED = 'agent_agreed',
  AGENT_ACTIVE = 'agent_active',
}

export enum RejectionReason {
  PRICE_TOO_HIGH = 'price_too_high',
  NOT_INTERESTED = 'not_interested',
  WRONG_TIMING = 'wrong_timing',
  COMPETITOR_CHOSEN = 'competitor_chosen',
  NO_BUDGET = 'no_budget',
  NO_AUTHORITY = 'no_authority',
  OTHER = 'other',
  DEFECTIVE_LEAD = 'defective_lead',
  OTHER_REASON = 'other_reason',
  PARTNERSHIP_TERMINATED = 'partnership_terminated',
  CANNOT_CONTACT = 'cannot_contact',
}

export type BudgetCurrency = 'USD' | 'EUR' | 'RUB' | 'KZT';

export interface Category {
  _id: string;
  id: number;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
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
  subtasks?: Subtask[];
  files?: TaskFile[];
  hasFiles?: boolean;
  syncWithCalendar?: boolean;
  calendarEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  title: string;
  completed?: boolean;
}

export interface TaskFile {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface NoteFile {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface Note {
  _id: string;
  title: string;
  content?: string;
  isPinned: boolean;
  category?: number;
  fullName?: string;
  leadId?: string;
  taskId?: string;
  createdBy: string;
  files: NoteFile[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteDto {
  title: string;
  content?: string;
  isPinned?: boolean;
  category?: number;
  fullName?: string;
  leadId?: string;
  taskId?: string;
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  isPinned?: boolean;
  category?: number;
  leadId?: string | null;
}

export interface LibraryFolder {
  _id: string;
  name: string;
  parentId: string | null;
  createdBy: { _id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface LeadFile {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  folderId?: string | null;
}

export interface Lead {
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
  history: LeadHistory[];
  dealValue: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: BudgetCurrency;
  tags?: string[];
  files?: LeadFile[];
  createdAt: string;
  updatedAt: string;
  /** Роли человека в отношениях с агентством (может быть несколько одновременно) */
  roles?: LeadRole[];
  /** Краткое резюме отношений, собранное AI из истории общения */
  aiSummary?: string;
}

/**
 * Роль человека в отношениях с агентством. Один клиент может совмещать несколько ролей
 * одновременно (например, купил квартиру, затем передал реферала, затем продаёт свой объект) —
 * общая история отношений остаётся в одной карточке.
 */
export type LeadRole = 'buyer' | 'investor' | 'owner' | 'referral_partner' | 'broker';

export const LEAD_ROLE_LABEL: Record<LeadRole, string> = {
  buyer: 'Покупатель',
  investor: 'Инвестор',
  owner: 'Собственник',
  referral_partner: 'Реферальный партнёр',
  broker: 'Посредник',
};

export interface RawFavoriteObject {
  _id: string;
  title?: string;
  coordinates?: [number, number];
  price?: number;
  price_sqm?: number;
  price_per_month?: number;
  tags?: string[];
  amenities?: string[];
  rooms?: string;
  area?: number;
  renovation?: string;
  propertyType?: string;
  dealType?: string;
  status?: string;
  images?: string[];
  photos?: string[];
  image?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FavoriteObject {
  id: string;
  title?: string;
  location?: string;
  price?: number;
  pricePerSqm?: number;
  pricePerMonth?: number;
  rooms?: string;
  area?: number;
  propertyType?: string;
  dealType?: string;
  status?: string;
  coordinates?: [number, number];
  tags?: string[];
  amenities?: string[];
  createdAt?: string;
  updatedAt?: string;
  imageUrl?: string;
  images?: string[];
}

export interface LeadHistory {
  fromStage: LeadStage;
  toStage: LeadStage;
  changedAt: string;
  changedBy: string;
  userName: string;
  userRole: string;
  comment?: string;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  priority: TaskPriority;
  startDate?: string;
  endDate?: string;
  colorLabel?: string;
  category?: number;
  categories?: string[];
  clientName?: string;
  assignedTo: string;
  leadId?: string;
  subtasks?: Subtask[];
  syncWithCalendar?: boolean;
}

export interface UpdateTaskDto {
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
  subtasks?: Subtask[];
  syncWithCalendar?: boolean;
}

export interface CreateLeadDto {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  productType: ProductType;
  assignedTo: string;
  source?: string;
  notes?: string;
  dealValue?: number;
  expectedCloseDate?: string;
  budgetValue?: number;
  budgetCurrency?: BudgetCurrency;
}

export interface UpdateLeadDto {
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

export interface UpdateLeadStageDto {
  stage?: LeadStage;
  realtorStage?: LeadStage;
  curatorStage?: LeadStage;
  comment?: string;
  rejectionReason?: RejectionReason;
  rejectionComment?: string;
}

export enum NotificationType {
  REMINDER = 'reminder',
  NEWS = 'news',
  TASK_DUE = 'task_due',
  LEAD_UPDATE = 'lead_update',
  SYSTEM = 'system',
  REQUEST = 'request',
  RESPONSE = 'response',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum EventType {
  MEETING = 'meeting',
  CALL = 'call',
  REMINDER = 'reminder',
  TASK = 'task',
  LEAD_FOLLOWUP = 'lead_followup',
}

export enum EventStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  type: EventType;
  status: EventStatus;
  isAllDay?: boolean;
  location?: string;
  meetingUrl?: string;
  color?: string;
  leadId?: string | { _id: string; name: string; phone: string };
  taskId?: string | { _id: string; title: string };
  participants?: Array<{ _id: string; name: string; email: string }>;
  externalParticipants?: string[];
  reminderMinutes?: number[];
  isRecurring?: boolean;
  recurringRule?: string;
  parentEventId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventDto {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  type: EventType;
  status?: EventStatus;
  isAllDay?: boolean;
  location?: string;
  meetingUrl?: string;
  leadId?: string;
  taskId?: string;
  participants?: string[];
  externalParticipants?: string[];
  reminderMinutes?: number[];
  isRecurring?: boolean;
  recurringRule?: string;
  parentEventId?: string;
}

export interface UpdateCalendarEventDto {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  type?: EventType;
  status?: EventStatus;
  isAllDay?: boolean;
  location?: string;
  meetingUrl?: string;
  leadId?: string | null;
  taskId?: string | null;
  participants?: string[];
  externalParticipants?: string[];
  reminderMinutes?: number[];
  isRecurring?: boolean;
  recurringRule?: string;
  parentEventId?: string | null;
}

export interface NotificationAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  userId: string;
  isRead: boolean;
  isArchived: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
  taskId?: string;
  leadId?: string;
  requestText?: string;
  requestDescription?: string;
  responseText?: string;
  responseDescription?: string;
  attachments: NotificationAttachment[];
  parentRequestId?: string;
  respondedBy?: string;
  respondedAt?: string;
  reminderAt?: string;
  dueDate?: string;
  reminderCount?: number;
  nextReminderAt?: string;
  expiresAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationDto {
  title: string;
  message: string;
  type: NotificationType;
  userId: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, any>;
  taskId?: string;
  leadId?: string;
  reminderAt?: string;
  dueDate?: string;
  requestText?: string;
  requestDescription?: string;
  responseText?: string;
  responseDescription?: string;
  attachments?: NotificationAttachment[];
  parentRequestId?: string;
}

export interface UpdateNotificationDto extends Partial<CreateNotificationDto> {
  isRead?: boolean;
  isArchived?: boolean;
}

export interface NotificationFilterDto {
  type?: NotificationType;
  priority?: NotificationPriority;
  isRead?: boolean;
  isArchived?: boolean;
  taskId?: string;
  leadId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface BulkMarkReadDto {
  notificationIds?: string[];
  markAllAsRead?: boolean;
}

export interface RespondToRequestDto {
  responseText: string;
  responseDescription?: string;
  attachments?: NotificationAttachment[];
}

export enum AppealType {
  TECHNICAL = 'technical',
  FEATURE_REQUEST = 'feature_request',
  BUG_REPORT = 'bug_report',
  QUESTION = 'question',
  COMPLAINT = 'complaint',
  OTHER = 'other',
}

export enum AppealUrgency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AppealAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  originalCdnUrl?: string;
}

export interface Appeal {
  _id: string;
  uniqueNumber: string;
  type: AppealType;
  text: string;
  attachments: AppealAttachment[];
  contactInfo: { phone?: string; email?: string; telegram?: string; other?: string };
  urgency: AppealUrgency;
  userId: string;
  userEmail: string;
  isSent: boolean;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAppealDto {
  type: AppealType;
  text: string;
  attachments?: { cdnUrl: string; filename?: string; size?: number }[];
  contactInfo?: { phone?: string; email?: string; telegram?: string; other?: string };
  urgency?: AppealUrgency;
  userId: string;
  userEmail: string;
}
