/**
 * Типы нового API календаря BAZA (apps/api/src/modules/crm/calendar-event.controller.ts,
 * CrmCalendarEventReadModel в crm.service.ts). Зеркалит backend-контракт
 * 1:1 — НЕ легаси-форму `CalEvent` (data/calendar-events-mock.ts), для
 * перевода в неё см. lib/calendar-v2-legacy-adapter.ts.
 */

/** apps/api/src/modules/crm/schemas/calendar-event.schema.ts::CALENDAR_EVENT_TYPES. */
export const CALENDAR_EVENT_TYPES_V2 = ['meeting', 'call', 'reminder', 'task', 'lead_followup'] as const
export type CalendarEventTypeV2 = (typeof CALENDAR_EVENT_TYPES_V2)[number]

export const CALENDAR_EVENT_STATUSES_V2 = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const
export type CalendarEventStatusV2 = (typeof CALENDAR_EVENT_STATUSES_V2)[number]

export interface CalendarEventV2 {
  id: string
  organizationId: string
  title: string
  description: string | null
  startTime: string
  endTime: string
  type: CalendarEventTypeV2
  status: CalendarEventStatusV2
  isAllDay: boolean
  location: string | null
  meetingUrl: string | null
  leadId: string | null
  dealId: string | null
  /** Position id участников — не Contact/Identity. */
  participants: string[]
  externalParticipants: string[]
  /** ХРАНИТСЯ, НЕ ИНТЕРПРЕТИРУЕТСЯ backend'ом — см. CalendarEventDocument докстринг. */
  reminderMinutes: number[]
  /** ХРАНИТСЯ, НЕ ИНТЕРПРЕТИРУЕТСЯ — сервер не генерирует серию будущих вхождений. */
  isRecurring: boolean
  recurringRule: string | null
  parentEventId: string | null
  createdByPositionId: string
  /** Optimistic concurrency — обязателен как expectedVersion в PATCH .../move и PATCH /:id. */
  version: number
  createdAt: string
  updatedAt: string | null
}

/** POST /api/v1/calendar/events body — см. CreateCalendarEventDto. */
export interface CreateCalendarEventV2Payload {
  title: string
  description?: string
  startTime: string
  endTime: string
  type?: CalendarEventTypeV2
  isAllDay?: boolean
  location?: string
  meetingUrl?: string
  leadId?: string
  dealId?: string
  participants?: string[]
  externalParticipants?: string[]
  reminderMinutes?: number[]
  isRecurring?: boolean
  recurringRule?: string
  parentEventId?: string
}

/**
 * PATCH /api/v1/calendar/events/:id body — см. UpdateCalendarEventDto. НЕ
 * содержит startTime/endTime (перенос — отдельный эндпоинт .../move).
 */
export interface UpdateCalendarEventV2Payload {
  expectedVersion: number
  title?: string
  description?: string | null
  type?: CalendarEventTypeV2
  status?: CalendarEventStatusV2
  isAllDay?: boolean
  location?: string | null
  meetingUrl?: string | null
  leadId?: string | null
  dealId?: string | null
  participants?: string[]
  externalParticipants?: string[]
  reminderMinutes?: number[]
  isRecurring?: boolean
  recurringRule?: string | null
  parentEventId?: string | null
}

/** PATCH /api/v1/calendar/events/:id/move body. */
export interface MoveCalendarEventV2Payload {
  expectedVersion: number
  newStartTime: string
  newEndTime: string
}

export interface ListCalendarEventsV2Params {
  startDate: string
  endDate: string
  type?: CalendarEventTypeV2
  leadId?: string
  dealId?: string
}

export interface ListCalendarEventsV2Response {
  items: CalendarEventV2[]
}

/**
 * Минимальная проекция Task для объединённого вида календаря
 * (GET /api/v1/calendar/unified) — не полный TaskV2.
 */
export interface CalendarUnifiedTaskV2 {
  id: string
  title: string
  description: string | null
  startAt: string | null
  dueAt: string | null
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  assignedPositionId: string | null
  leadId: string | null
}

export interface CalendarUnifiedV2Response {
  events: CalendarEventV2[]
  tasks: CalendarUnifiedTaskV2[]
}
