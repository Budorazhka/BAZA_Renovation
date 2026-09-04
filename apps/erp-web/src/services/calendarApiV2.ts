import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  CalendarEventV2,
  CalendarUnifiedV2Response,
  CreateCalendarEventV2Payload,
  ListCalendarEventsV2Params,
  ListCalendarEventsV2Response,
  MoveCalendarEventV2Payload,
  UpdateCalendarEventV2Payload,
} from '@/types/calendarV2'

export * from '@/types/calendarV2'

/**
 * Изолированный клиент к API календаря BAZA
 * (apps/api/src/modules/crm/calendar-event.controller.ts), по образцу
 * dealsApiV2.ts.
 *
 * Эндпоинты:
 * - GET    /api/v1/calendar/events?startDate=&endDate=&type=&leadId=&dealId=
 * - GET    /api/v1/calendar/events/:eventId
 * - POST   /api/v1/calendar/events                     (требует заголовок Idempotency-Key)
 * - PATCH  /api/v1/calendar/events/:eventId             body: { expectedVersion, title?, ... } — НЕ startTime/endTime
 * - PATCH  /api/v1/calendar/events/:eventId/move        body: { expectedVersion, newStartTime, newEndTime }
 * - DELETE /api/v1/calendar/events/:eventId             soft delete, БЕЗ expectedVersion (тот же выбор, что DELETE /leads/:id)
 * - GET    /api/v1/calendar/unified?startDate=&endDate= — {events, tasks}
 *
 * Авторизация только через cookie (withCredentials: true). Организация и права проверяются бэкендом.
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/** Тот же паттерн, что leadsApiV2/tasksApiV2/dealsApiV2 — локальная копия, не общий хелпер. */
export function newIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `calendar-event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const calendarApiV2 = {
  /** GET /api/v1/calendar/events. startDate/endDate обязательны — сервер не отдаёт бесконечный список. */
  async list(params: ListCalendarEventsV2Params): Promise<ListCalendarEventsV2Response> {
    const { data } = await api.get<ListCalendarEventsV2Response>('/api/v1/calendar/events', { params })
    return data
  },

  /** GET /api/v1/calendar/events/:id */
  async getById(id: string): Promise<CalendarEventV2> {
    const { data } = await api.get<CalendarEventV2>(`/api/v1/calendar/events/${id}`)
    return data
  },

  /** POST /api/v1/calendar/events. Заголовок Idempotency-Key обязателен — без него 400. */
  async create(payload: CreateCalendarEventV2Payload, idempotencyKey: string): Promise<CalendarEventV2> {
    const { data } = await api.post<CalendarEventV2>('/api/v1/calendar/events', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /**
   * PATCH /api/v1/calendar/events/:id — общие поля, НЕ startTime/endTime
   * (перенос — отдельный метод .move). expectedVersion — CAS: 409 при
   * устаревшей version.
   */
  async update(id: string, payload: UpdateCalendarEventV2Payload): Promise<CalendarEventV2> {
    const { data } = await api.patch<CalendarEventV2>(`/api/v1/calendar/events/${id}`, payload)
    return data
  },

  /**
   * PATCH /api/v1/calendar/events/:id/move — легаси отдельно выделяет
   * "перетащить в календаре" от общего PATCH. expectedVersion — CAS.
   */
  async move(id: string, payload: MoveCalendarEventV2Payload): Promise<CalendarEventV2> {
    const { data } = await api.patch<CalendarEventV2>(`/api/v1/calendar/events/${id}/move`, payload)
    return data
  },

  /** DELETE /api/v1/calendar/events/:id — soft delete, БЕЗ expectedVersion. */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const { data } = await api.delete<{ deleted: boolean }>(`/api/v1/calendar/events/${id}`)
    return data
  },

  /** GET /api/v1/calendar/unified — объединяет события с задачами по dueAt. */
  async getUnified(params: { startDate: string; endDate: string }): Promise<CalendarUnifiedV2Response> {
    const { data } = await api.get<CalendarUnifiedV2Response>('/api/v1/calendar/unified', { params })
    return data
  },
}
