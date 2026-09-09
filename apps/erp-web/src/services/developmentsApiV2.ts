import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'

/**
 * D-02 (26.08.2026): изолированный клиент к НОВОМУ D-01 backend
 * (apps/api/src/modules/developments), физически отдельному от legacy
 * developmentApi.ts (/api/development/* — старый berega-api-совместимый
 * путь на том же origin, useCoreStore.ts::IProject).
 *
 * НАМЕРЕННО не заменяет useCoreStore.ts/визард в этом проходе — legacy
 * IProject несёт десятки маркетинговых полей (renders/promotions/
 * installmentPlans/realtorScripts/инфраструктура и т.д.), которых физически
 * нет в новой Development-схеме (только name/location/contact/classType/
 * startDate/completionDate/description, см. domain-model.md Модуль 4).
 * Честная миграция store — отдельная задача (владелец решает, что делать с
 * полями, которых на новом backend нет: терять, переносить в отдельную
 * legacy-only коллекцию, или расширять backend). Этот клиент — рабочая,
 * подтверждённая E2E точка входа для этой будущей миграции, не подмена её.
 *
 * Использует PLATFORM_API_BASE_URL (baseURL, withCredentials) — тот же
 * backend, что и leadsApiV2 (см. apps/api/src/modules/developments), не
 * CRM_API_BASE_URL/legacy developmentApi.ts.
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Idempotency-Key на конкретную пользовательскую попытку publish (backend
 * требует заголовок, см. DevelopmentsController.publishDevelopment). Ключ
 * держится per-developmentId, пока попытка не завершилась успехом — повторная
 * отправка ТОЙ ЖЕ попытки (ретрай сети, двойной клик до resolve) переиспользует
 * тот же ключ и безопасно попадает в checkReplay на backend; ключ очищается
 * после успеха или явной ошибки, так что следующий клик — уже новая попытка.
 */
const publishAttemptKeys = new Map<string, string>()

function publishIdempotencyKey(developmentId: string): string {
  let key = publishAttemptKeys.get(developmentId)
  if (!key) {
    key = uid()
    publishAttemptKeys.set(developmentId, key)
  }
  return key
}

export type DevelopmentStatus = 'draft' | 'active' | 'archived'

export interface DevelopmentGeoPoint {
  type: 'Point'
  /** [longitude, latitude] — ADR-007, порядок строгий. */
  coordinates: [number, number]
}

export interface DevelopmentLocation {
  country: string
  city: string
  address?: string
  geo: DevelopmentGeoPoint
}

export interface DevelopmentContact {
  phone: string
  whatsapp?: string
  telegram?: string
}

export interface DevelopmentV2 {
  _id: string
  organizationId: string
  name: string
  status: DevelopmentStatus
  location: DevelopmentLocation
  classType?: string
  startDate?: string
  completionDate?: string
  description?: string
  contact: DevelopmentContact
  version: number
  createdAt: string
}

export interface CreateDevelopmentV2Payload {
  name: string
  location: DevelopmentLocation
  contact: DevelopmentContact
  classType?: string
  startDate?: string
  completionDate?: string
  description?: string
}

export type UpdateDevelopmentV2Payload = Partial<CreateDevelopmentV2Payload> & {
  /** conventions.md разд.5: optimistic concurrency, обязателен. */
  expectedVersion: number
}

export interface ListDevelopmentsV2Result {
  items: DevelopmentV2[]
  nextCursor: string | null
}

export interface PublishDevelopmentResult {
  id: string
  sourceType: 'development'
  sourceId: string
  status: string
}

/**
 * D-03: реальный статус MarketplacePublication (не Development.status,
 * который меняется синхронно и не отражает готовность marketplace-проекции).
 */
export interface PublicationStatusResult {
  publicationId: string
  status: 'publication_pending' | 'published' | 'unpublished' | 'build_failed'
  slug?: string
  version: number
  publishedAt?: string
  unpublishedAt?: string
  buildError?: string
}

export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] }

export interface BuildingV2 {
  _id: string
  developmentId: string
  organizationId: string
  name: string
  floorsCount: number
  startDate?: string
  completionDate?: string
  polygon?: GeoPolygon
  createdAt: string
}

export interface CreateBuildingV2Payload {
  name: string
  floorsCount: number
  startDate?: string
  completionDate?: string
}

export interface SectionV2 {
  _id: string
  buildingId: string
  organizationId: string
  name: string
  createdAt: string
}

export interface FloorV2 {
  _id: string
  buildingId: string
  sectionId?: string
  organizationId: string
  floorNumber: number
  floorType?: string
  createdAt: string
}

export interface CreateFloorV2Payload {
  floorNumber: number
  sectionId?: string
  floorType?: string
}

export interface FloorPlanV2 {
  _id: string
  buildingId: string
  organizationId: string
  name: string
  rooms: number
  area: number
  isEuro?: boolean
  imageAssetId?: string
  tags: string[]
  createdAt: string
}

export interface CreateFloorPlanV2Payload {
  name: string
  rooms: number
  area: number
  isEuro?: boolean
  imageAssetId?: string
  tags?: string[]
}

export type MoneyCurrency = 'USD' | 'GEL' | 'RUB'

export interface MoneyAmountV2 {
  /** Целое число минимальных единиц (копейки/тетри/центы) — никогда JS float. */
  amountMinorUnits: number
  currency: MoneyCurrency
}

export type UnitKindV2 = 'apartment' | 'commercial' | 'office' | 'parking' | 'storage' | 'other'
export type UnitStatusV2 = 'available' | 'reserved' | 'sold' | 'hidden'

export interface UnitPriceHistoryEntryV2 {
  price: MoneyAmountV2
  changedAt: string
  changedBy: string
}

export interface UnitV2 {
  _id: string
  buildingId: string
  floorId: string
  sectionId?: string
  organizationId: string
  number: string
  kind: UnitKindV2
  rooms?: number
  area: number
  areaLiving?: number
  areaBalcony?: number
  price: MoneyAmountV2
  status: UnitStatusV2
  floorPlanId?: string
  priceHistory: UnitPriceHistoryEntryV2[]
  version: number
  createdAt: string
}

export interface CreateUnitV2Payload {
  number: string
  kind: UnitKindV2
  rooms?: number
  area: number
  areaLiving?: number
  areaBalcony?: number
  price: MoneyAmountV2
  floorPlanId?: string
}

export interface ListUnitsV2Filters {
  kind?: UnitKindV2
  status?: UnitStatusV2
  limit?: number
}

/**
 * P1 fix (после этой сессии): main.api.ts вызывает
 * app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] }) —
 * DevelopmentsController (@Controller() пустой, без своего префикса) не в
 * exclude-списке, поэтому реальные пути на живом backend — /api/v1/developments,
 * /api/v1/buildings/..., /api/v1/floors/..., /api/v1/units/..., не голые
 * /developments и т.д. Без этого префикса каждый вызов ниже давал 404.
 */

/**
 * Ключи идемпотентности для создающих команд девелопмента. Тот же принцип, что
 * у ключа публикации выше: ключ живёт до успеха попытки, а не создаётся на
 * каждый вызов. Повтор отправки той же формы после сетевой ошибки обязан уйти
 * с ТЕМ ЖЕ ключом — иначе backend создаст второй корпус/этаж/юнит.
 */
const createAttemptKeys = new Map<string, string>()

export function getCreateIdempotencyKey(scope: string): string {
  let key = createAttemptKeys.get(scope)
  if (!key) {
    key = uid()
    createAttemptKeys.set(scope, key)
  }
  return key
}

export function resetCreateIdempotencyKey(scope: string): void {
  createAttemptKeys.delete(scope)
}

export const developmentsApiV2 = {
  /** POST /api/v1/developments — @RequirePermission('development','edit'). */
  async create(payload: CreateDevelopmentV2Payload, idempotencyKey: string): Promise<DevelopmentV2> {
    const { data } = await api.post<DevelopmentV2>('/api/v1/developments', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** GET /api/v1/developments — cursor-пагинация, НЕ {success,data} обёртка (в отличие от team-users). */
  async list(params?: { cursor?: string; limit?: number }): Promise<ListDevelopmentsV2Result> {
    const { data } = await api.get<ListDevelopmentsV2Result>('/api/v1/developments', { params })
    return data
  },

  async getById(id: string): Promise<DevelopmentV2> {
    const { data } = await api.get<DevelopmentV2>(`/api/v1/developments/${id}`)
    return data
  },

  /** PATCH /api/v1/developments/:id — optimistic concurrency, expectedVersion обязателен. */
  async update(id: string, payload: UpdateDevelopmentV2Payload): Promise<DevelopmentV2> {
    const { data } = await api.patch<DevelopmentV2>(`/api/v1/developments/${id}`, payload)
    return data
  },

  /**
   * POST /api/v1/developments/:id/publish — 202 Accepted, worker строит
   * проекцию асинхронно (ADR-005/ADR-006). Только draft может быть
   * опубликован.
   */
  async publish(id: string): Promise<PublishDevelopmentResult> {
    // {} явно, не пустой вызов — axios-инстанс несёт Content-Type:application/json
    // глобально (см. api = axios.create(...) выше); совсем без второго
    // аргумента axios всё равно шлёт этот заголовок, но с пустым телом,
    // а Fastify's JSON body-parser отклоняет пустое тело при заявленном
    // application/json content-type (найдено реальным E2E-прогоном).
    // Idempotency-Key обязателен на backend (publishDevelopment бросает
    // IDEMPOTENCY_KEY_REQUIRED без него) — см. publishIdempotencyKey выше.
    const idempotencyKey = publishIdempotencyKey(id)
    // Ключ НЕ очищается при ошибке — ретрай той же попытки (после сетевого
    // сбоя/таймаута с неясным исходом) обязан слать тот же ключ, иначе
    // checkReplay на backend не защитит от повторной публикации.
    const { data } = await api.post<PublishDevelopmentResult>(
      `/api/v1/developments/${id}/publish`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    publishAttemptKeys.delete(id)
    return data
  },

  /** GET /api/v1/developments/:id/publication-status — read-only, для polling после publish. */
  async getPublicationStatus(id: string): Promise<PublicationStatusResult> {
    const { data } = await api.get<PublicationStatusResult>(`/api/v1/developments/${id}/publication-status`)
    return data
  },

  /** POST /api/v1/developments/:id/buildings. */
  async createBuilding(developmentId: string, payload: CreateBuildingV2Payload, idempotencyKey: string): Promise<BuildingV2> {
    const { data } = await api.post<BuildingV2>(`/api/v1/developments/${developmentId}/buildings`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** POST /api/v1/buildings/:id/sections — опционально, Unit может обойтись без Section. */
  async createSection(buildingId: string, payload: { name: string }, idempotencyKey: string): Promise<SectionV2> {
    const { data } = await api.post<SectionV2>(`/api/v1/buildings/${buildingId}/sections`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** POST /api/v1/buildings/:id/floors. */
  async createFloor(buildingId: string, payload: CreateFloorV2Payload, idempotencyKey: string): Promise<FloorV2> {
    const { data } = await api.post<FloorV2>(`/api/v1/buildings/${buildingId}/floors`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** POST /api/v1/buildings/:id/floor-plans — переиспользуемая планировка, many units share one plan. */
  async createFloorPlan(buildingId: string, payload: CreateFloorPlanV2Payload, idempotencyKey: string): Promise<FloorPlanV2> {
    const { data } = await api.post<FloorPlanV2>(`/api/v1/buildings/${buildingId}/floor-plans`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /**
   * POST /api/v1/floors/:id/units?buildingId=... — buildingId ОБЯЗАТЕЛЕН
   * query-параметром (не часть URL-пути, backend сверяет floor.buildingId
   * с ним server-side, см. DevelopmentsController.createUnit комментарий).
   */
  async createUnit(floorId: string, buildingId: string, payload: CreateUnitV2Payload, idempotencyKey: string): Promise<UnitV2> {
    const { data } = await api.post<UnitV2>(`/api/v1/floors/${floorId}/units`, payload, {
      params: { buildingId },
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /**
   * D-02 COMPLETE: read-side дочерней иерархии. Все 6 методов ниже
   * возвращают голый массив/объект (не {items,nextCursor} обёртку —
   * cursor-пагинация не нужна: buildings/sections/floors/floor-plans на
   * родителя реалистично малое число, units ограничены query-параметром
   * limit, максимум 500 — см. backend ListUnitsQueryDto).
   */

  /** GET /api/v1/developments/:id/buildings. */
  async listBuildings(developmentId: string): Promise<BuildingV2[]> {
    const { data } = await api.get<BuildingV2[]>(`/api/v1/developments/${developmentId}/buildings`)
    return data
  },

  /** GET /api/v1/buildings/:id/sections. */
  async listSections(buildingId: string): Promise<SectionV2[]> {
    const { data } = await api.get<SectionV2[]>(`/api/v1/buildings/${buildingId}/sections`)
    return data
  },

  /** GET /api/v1/buildings/:id/floors. */
  async listFloors(buildingId: string): Promise<FloorV2[]> {
    const { data } = await api.get<FloorV2[]>(`/api/v1/buildings/${buildingId}/floors`)
    return data
  },

  /** GET /api/v1/buildings/:id/floor-plans. */
  async listFloorPlans(buildingId: string): Promise<FloorPlanV2[]> {
    const { data } = await api.get<FloorPlanV2[]>(`/api/v1/buildings/${buildingId}/floor-plans`)
    return data
  },

  /** GET /api/v1/buildings/:id/units — kind/status/limit как query-параметры, максимум 500. */
  async listUnits(buildingId: string, filters?: ListUnitsV2Filters): Promise<UnitV2[]> {
    const { data } = await api.get<UnitV2[]>(`/api/v1/buildings/${buildingId}/units`, { params: filters })
    return data
  },

  /** GET /api/v1/units/:id. */
  async getUnit(unitId: string): Promise<UnitV2> {
    const { data } = await api.get<UnitV2>(`/api/v1/units/${unitId}`)
    return data
  },

  /** PATCH /api/v1/units/:id/price — critical action (permission-matrix.md), audit обязателен на backend. */
  async updateUnitPrice(unitId: string, expectedVersion: number, price: MoneyAmountV2): Promise<UnitV2> {
    const { data } = await api.patch<UnitV2>(`/api/v1/units/${unitId}/price`, { expectedVersion, price })
    return data
  },

  /** PATCH /api/v1/units/:id/status. */
  async updateUnitStatus(unitId: string, expectedVersion: number, status: UnitStatusV2): Promise<UnitV2> {
    const { data } = await api.patch<UnitV2>(`/api/v1/units/${unitId}/status`, { expectedVersion, status })
    return data
  },

  /** POST /api/v1/buildings/:id/chessboard/generate. */
  async generateChessboard(buildingId: string, payload: GenerateChessboardPayload, idempotencyKey: string): Promise<UnitV2[]> {
    const { data } = await api.post<UnitV2[]>(`/api/v1/buildings/${buildingId}/chessboard/generate`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** POST /api/v1/buildings/:id/units/batch. */
  async batchCreateUnits(buildingId: string, payload: BatchCreateUnitsPayload, idempotencyKey: string): Promise<UnitV2[]> {
    const { data } = await api.post<UnitV2[]>(`/api/v1/buildings/${buildingId}/units/batch`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /** POST /api/v1/developments/:id/units/batch-price-update. */
  async batchUpdatePrices(developmentId: string, payload: BatchUpdatePricesPayload, idempotencyKey: string): Promise<BatchUpdatePricesResult> {
    const { data } = await api.post<BatchUpdatePricesResult>(`/api/v1/developments/${developmentId}/units/batch-price-update`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },
}

export interface GenerateChessboardPayload {
  sectionId?: string
  fromFloor: number
  toFloor: number
  unitsPerFloor: number
  numberingScheme?: 'floor_prefix' | 'sequential'
  defaultKind?: UnitKindV2
  rooms?: number
  defaultArea: number
  defaultAreaLiving?: number
  defaultAreaBalcony?: number
  defaultPrice?: MoneyAmountV2
  floorPlanId?: string
}

export interface BatchCreateUnitItemPayload {
  floorNumber: number
  sectionId?: string
  number: string
  kind: UnitKindV2
  rooms?: number
  area: number
  areaLiving?: number
  areaBalcony?: number
  price: MoneyAmountV2
  floorPlanId?: string
}

export interface BatchCreateUnitsPayload {
  units: BatchCreateUnitItemPayload[]
}

export type PriceOperationType = 'percentage' | 'delta_per_sqm' | 'fixed_price_per_sqm' | 'fixed_total'

export interface BatchUpdatePricesPayload {
  buildingId?: string
  floorMin?: number
  floorMax?: number
  kind?: UnitKindV2
  unitIds?: string[]
  operationType: PriceOperationType
  value: number
  reason?: string
}

export interface BatchUpdatePricesResult {
  updatedCount: number
}
