import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  CreateLeadV2Payload,
  LeadStageChangeResult,
  LeadV2,
  ListLeadsV2Params,
  ListLeadsV2Response,
} from '@/types/leadsV2'

export * from '@/types/leadsV2'

/**
 * Изолированный клиент к новому API лидов BAZA (apps/api/src/modules/crm/lead.controller.ts).
 *
 * Эндпоинты:
 * - GET /api/v1/leads?stage=<optional>&ownerPositionId=<optional>&stalled=<optional>&cursor=<optional>&limit=<1..100>
 * - GET /api/v1/leads/:leadId
 * - POST /api/v1/leads body: CreateLeadV2Payload (требует заголовок Idempotency-Key)
 * - PATCH /api/v1/leads/:leadId/stage body: { stage: string, expectedVersion: number } (требует заголовок Idempotency-Key)
 * - POST /api/v1/leads/:leadId/assign body: { assigneePositionId: string }
 * - POST /api/v1/leads/:leadId/unassign
 *
 * Авторизация только через cookie (withCredentials: true).
 * Tenant и права проверяются бэкендом (organizationId не передаётся клиентом).
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/** Предел одного запроса на стороне сервера (MAX_LEAD_LIST_LIMIT). */
const LEADS_PER_REQUEST = 100

/** Тот же предел страниц, что tasksApiV2.listAll — см. её докстринг. */
const MAX_LEAD_PAGES = 20

/**
 * Ключ идемпотентности: повтор отправки той же формы (двойной клик, ретрай
 * после обрыва) не должен создавать вторую сущность. Тот же паттерн, что
 * tasksApiV2.newIdempotencyKey/developmentsApiV2 — локальная копия, не
 * общий хелпер: каждый V2-клиент в erp-web изолирован намеренно.
 */
export function newIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const leadsApiV2 = {
  /** GET /api/v1/leads?stage=<optional>&limit=<1..100> */
  async list(params?: ListLeadsV2Params): Promise<ListLeadsV2Response> {
    const { data } = await api.get<ListLeadsV2Response>('/api/v1/leads', { params })
    return data
  },

  /**
   * Все лиды организации, а не первая страница (сервер отдаёт максимум 100
   * записей за запрос и `nextCursor`) — тот же паттерн, что
   * tasksApiV2.listAll. `complete: false` — упёрлись в предел страниц,
   * показаны не все лиды; это состояние обязано быть видно вызывающему
   * коду, а не молчать.
   */
  async listAll(
    params?: Omit<ListLeadsV2Params, 'cursor'>,
    maxPages = MAX_LEAD_PAGES,
  ): Promise<{ items: LeadV2[]; complete: boolean }> {
    const items: LeadV2[] = []
    let cursor: string | undefined
    let complete = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.list({ ...params, limit: LEADS_PER_REQUEST, cursor })
      items.push(...response.items)
      if (!response.nextCursor) {
        complete = true
        break
      }
      cursor = response.nextCursor
    }

    return { items, complete }
  },

  /** GET /api/v1/leads/:id */
  async getById(id: string): Promise<LeadV2> {
    const { data } = await api.get<LeadV2>(`/api/v1/leads/${id}`)
    return data
  },

  /** POST /api/v1/leads. Заголовок Idempotency-Key обязателен — без него 400. */
  async create(payload: CreateLeadV2Payload, idempotencyKey: string): Promise<LeadV2> {
    const { data } = await api.post<LeadV2>('/api/v1/leads', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /**
   * PATCH /api/v1/leads/:id/stage. expectedVersion — прочитанная клиентом
   * version лида (см. LeadV2.version) — backend отклонит запрос с 409
   * VERSION_CONFLICT, если лид изменился с момента, когда клиент его читал
   * (optimistic concurrency, 27.08.2026). Вызывающий код должен перечитать
   * лид и повторить попытку с новой version при 409, не считать это фатальной
   * ошибкой.
   *
   * `stage` типизирован как `string`, не `LeadStageV2` — продуктовые лиды
   * (sales/network/owner/agent) используют собственные id стадий (см.
   * lib/lead-v2-poker-adapter.ts), которых нет в generic-пятёрке
   * LeadStageV2; backend валидирует принадлежность стадии продукту лида
   * сам (CrmService.changeLeadStage).
   *
   * `idempotencyKey` опционален — генерируется на каждый вызов (одна
   * попытка смены стадии = один ключ), если вызывающий код не передал свой
   * (тот же паттерн, что tasksApiV2.create, но с дефолтом ради обратной
   * совместимости существующего вызова в features/leads-v2/LeadDetailsModal.tsx).
   */
  async changeStage(
    id: string,
    stage: string,
    expectedVersion: number,
    idempotencyKey: string = newIdempotencyKey(),
  ): Promise<LeadStageChangeResult> {
    const { data } = await api.patch<LeadStageChangeResult>(
      `/api/v1/leads/${id}/stage`,
      { stage, expectedVersion },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    return data
  },

  /** POST /api/v1/leads/:id/assign */
  async assign(id: string, assigneePositionId: string): Promise<LeadStageChangeResult> {
    const { data } = await api.post<LeadStageChangeResult>(`/api/v1/leads/${id}/assign`, { assigneePositionId })
    return data
  },

  /** POST /api/v1/leads/:id/unassign — обратное действие assign, не меняет stage. */
  async unassign(id: string): Promise<LeadStageChangeResult> {
    const { data } = await api.post<LeadStageChangeResult>(`/api/v1/leads/${id}/unassign`)
    return data
  },
}
