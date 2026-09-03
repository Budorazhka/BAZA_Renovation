import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  ChecklistItemInputV2,
  CreateDealV2Payload,
  DealV2,
  ListDealsV2Params,
  ListDealsV2Response,
  UpdateDealV2Payload,
} from '@/types/dealsV2'

export * from '@/types/dealsV2'

/**
 * Изолированный клиент к API сделок BAZA (apps/api/src/modules/crm/deal.controller.ts).
 *
 * Эндпоинты:
 * - GET    /api/v1/deals?stage=&ownerPositionId=&leadId=&contactId=&cursor=&limit=<1..100>
 * - GET    /api/v1/deals/:dealId
 * - POST   /api/v1/deals                             (требует заголовок Idempotency-Key)
 * - PATCH  /api/v1/deals/:dealId                      body: { expectedVersion, title?, description?, expectedCommission? }
 * - PATCH  /api/v1/deals/:dealId/reassign             body: { expectedVersion, ownerPositionId } — client.reassign, не deal.edit
 * - PATCH  /api/v1/deals/:dealId/stage                body: { stage, expectedVersion, reason? } — БЕЗ Idempotency-Key (не требуется контроллером)
 * - POST   /api/v1/deals/:dealId/participants         body: { expectedVersion, contactId, role }
 * - DELETE /api/v1/deals/:dealId/participants/:contactId?expectedVersion=<int>
 * - PATCH  /api/v1/deals/:dealId/checklist            body: { expectedVersion, items }
 *
 * Авторизация только через cookie (withCredentials: true). Организация и права проверяются бэкендом.
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/** Предел одного запроса на стороне сервера (MAX_DEAL_LIST_LIMIT). */
const DEALS_PER_REQUEST = 100

/** Тот же предел страниц, что leadsApiV2.listAll/tasksApiV2.listAll. */
const MAX_DEAL_PAGES = 20

/** Тот же паттерн, что leadsApiV2/tasksApiV2 — локальная копия, не общий хелпер. */
export function newIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `deal-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const dealsApiV2 = {
  /** GET /api/v1/deals */
  async list(params?: ListDealsV2Params): Promise<ListDealsV2Response> {
    const { data } = await api.get<ListDealsV2Response>('/api/v1/deals', { params })
    return data
  },

  /**
   * Все сделки организации, а не первая страница — тот же паттерн, что
   * leadsApiV2.listAll/tasksApiV2.listAll. `complete: false` — упёрлись в
   * предел страниц, показаны не все сделки.
   */
  async listAll(
    params?: Omit<ListDealsV2Params, 'cursor'>,
    maxPages = MAX_DEAL_PAGES,
  ): Promise<{ items: DealV2[]; complete: boolean }> {
    const items: DealV2[] = []
    let cursor: string | undefined
    let complete = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.list({ ...params, limit: DEALS_PER_REQUEST, cursor })
      items.push(...response.items)
      if (!response.nextCursor) {
        complete = true
        break
      }
      cursor = response.nextCursor
    }

    return { items, complete }
  },

  /** GET /api/v1/deals/:id */
  async getById(id: string): Promise<DealV2> {
    const { data } = await api.get<DealV2>(`/api/v1/deals/${id}`)
    return data
  },

  /** POST /api/v1/deals. Заголовок Idempotency-Key обязателен — без него 400. */
  async create(payload: CreateDealV2Payload, idempotencyKey: string): Promise<DealV2> {
    const { data } = await api.post<DealV2>('/api/v1/deals', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /**
   * PATCH /api/v1/deals/:id — сопутствующие поля (title/description/
   * expectedCommission). НЕ трогает stage/ownerPositionId — у них отдельные
   * эндпоинты. expectedVersion — CAS: 409 при устаревшей version.
   */
  async update(id: string, payload: UpdateDealV2Payload): Promise<DealV2> {
    const { data } = await api.patch<DealV2>(`/api/v1/deals/${id}`, payload)
    return data
  },

  /**
   * PATCH /api/v1/deals/:id/reassign — client.reassign, отдельное право от
   * deal.edit (см. DealController докстринг). Владелец обязателен — снять
   * владельца сделки нельзя (в отличие от Task.assignedPositionId).
   */
  async reassign(id: string, expectedVersion: number, ownerPositionId: string): Promise<DealV2> {
    const { data } = await api.patch<DealV2>(`/api/v1/deals/${id}/reassign`, {
      expectedVersion,
      ownerPositionId,
    })
    return data
  },

  /**
   * PATCH /api/v1/deals/:id/stage. expectedVersion — CAS (см. changeDealStage
   * докстринг: version и допустимость перехода проверяются атомарно).
   * Контроллер НЕ принимает Idempotency-Key для этого эндпоинта (в отличие
   * от лидовского .../stage) — заголовок здесь не нужен.
   */
  async changeStage(
    id: string,
    stage: string,
    expectedVersion: number,
    reason?: string,
  ): Promise<DealV2> {
    const { data } = await api.patch<DealV2>(`/api/v1/deals/${id}/stage`, {
      stage,
      expectedVersion,
      reason,
    })
    return data
  },

  /** POST /api/v1/deals/:id/participants */
  async addParticipant(
    id: string,
    expectedVersion: number,
    contactId: string,
    role: string,
  ): Promise<DealV2> {
    const { data } = await api.post<DealV2>(`/api/v1/deals/${id}/participants`, {
      expectedVersion,
      contactId,
      role,
    })
    return data
  },

  /** DELETE /api/v1/deals/:id/participants/:contactId?expectedVersion=<int> */
  async removeParticipant(id: string, contactId: string, expectedVersion: number): Promise<DealV2> {
    const { data } = await api.delete<DealV2>(`/api/v1/deals/${id}/participants/${contactId}`, {
      params: { expectedVersion },
    })
    return data
  },

  /** PATCH /api/v1/deals/:id/checklist — список заменяется целиком. */
  async updateChecklist(
    id: string,
    expectedVersion: number,
    items: ChecklistItemInputV2[],
  ): Promise<DealV2> {
    const { data } = await api.patch<DealV2>(`/api/v1/deals/${id}/checklist`, {
      expectedVersion,
      items,
    })
    return data
  },
}
