import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'

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
 * Idempotency-Key per listing publish attempt.
 * A new key is generated on user click; cleared upon successful resolve or explicit retry.
 */
const publishAttemptKeys = new Map<string, string>()

export function getPublishIdempotencyKey(listingId: string): string {
  let key = publishAttemptKeys.get(listingId)
  if (!key) {
    key = uid()
    publishAttemptKeys.set(listingId, key)
  }
  return key
}

export function resetPublishIdempotencyKey(listingId: string): void {
  publishAttemptKeys.delete(listingId)
}

/**
 * Ключи создания объекта и листинга. Тот же принцип, что у публикации выше:
 * ключ живёт до успеха попытки, а не создаётся на каждый вызов. При повторной
 * отправки той же формы (сеть отвалилась, ответ потерян) обязан уйти ТОТ ЖЕ
 * ключ — иначе backend создаст второй объект, то есть ровно то, от чего
 * защищаемся. Scope — идентификатор попытки, свой у каждого открытого мастера.
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

export type PropertyAssetType = 'apartment' | 'house' | 'land' | 'commercial'
export type CommercialSubtype = 'office' | 'warehouse' | 'retail' | 'business' | 'free_purpose'

export interface PropertyAssetGeoPoint {
  type: 'Point'
  coordinates: [number, number]
}

export interface PropertyAssetLocation {
  country: string
  city: string
  address: string
  geo: PropertyAssetGeoPoint
}

export interface PropertyAssetCharacteristics {
  area: number
  rooms?: number
  floor?: number
  totalFloors?: number
}

export interface PropertyAsset {
  _id: string
  publisherScope: { type: 'organization'; organizationId: string }
  propertyType: PropertyAssetType
  commercialSubtype?: CommercialSubtype
  location: PropertyAssetLocation
  characteristics: PropertyAssetCharacteristics
  representativePhone: string
  version: number
  createdAt: string
  updatedAt?: string
}

export interface CreatePropertyAssetPayload {
  propertyType: PropertyAssetType
  commercialSubtype?: CommercialSubtype
  location: PropertyAssetLocation
  characteristics: PropertyAssetCharacteristics
  representativePhone: string
}

export type ListingDealType = 'sale' | 'rent_long' | 'rent_short'
export type CurrencyCode = 'USD' | 'GEL' | 'RUB'

export interface MoneyAmount {
  amountMinorUnits: number
  currency: CurrencyCode
}

export type ListingStatus = 'draft' | 'active' | 'expired' | 'archived'

export interface Listing {
  _id: string
  propertyAssetId: string
  publisherScope: { type: 'organization'; organizationId: string }
  dealType: ListingDealType
  price: MoneyAmount
  status: ListingStatus
  slug?: string
  version: number
  lastConfirmedAt?: string
  createdAt: string
  updatedAt?: string
}

export interface CreateListingPayload {
  dealType: ListingDealType
  price: MoneyAmount
}

export interface PublicationStatusResult {
  id: string
  sourceType: string
  sourceId: string
  status: 'publication_pending' | 'published' | 'unpublished' | 'build_failed'
  slug?: string
  unpublishReason?: string
}

export interface ActualityStateResult {
  status: string
  category: string
  thresholds: { warningDays: number; overdueDays: number }
  lastConfirmedAt: string
  state: 'fresh' | 'warning' | 'overdue' | null
}

export interface DuplicateSignals {
  phoneMatch: boolean
  addressMatch: boolean
  roomsAreaFloorMatch: boolean
}

export interface DuplicateCandidateResult {
  id: string
  _id?: string
  propertyAssetId?: string
  candidateAssetId?: string
  status: 'detected' | 'confirmed_duplicate' | 'override_not_duplicate'
  signals: DuplicateSignals
  overrideReason?: string
  overrideAt?: string
  detectedAt?: string
}

export interface PropertyAssetFullItem {
  asset: PropertyAsset
  listings: Listing[]
}

export const propertyAssetsApi = {
  async listAssets(): Promise<PropertyAsset[]> {
    const { data } = await api.get<PropertyAsset[]>('/api/v1/property-assets')
    return data
  },

  async getAsset(assetId: string): Promise<PropertyAsset> {
    const { data } = await api.get<PropertyAsset>(`/api/v1/property-assets/${assetId}`)
    return data
  },

  async createAsset(payload: CreatePropertyAssetPayload, idempotencyKey: string): Promise<PropertyAsset> {
    const { data } = await api.post<PropertyAsset>('/api/v1/property-assets', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  async listListings(assetId: string): Promise<Listing[]> {
    const { data } = await api.get<Listing[]>(`/api/v1/property-assets/${assetId}/listings`)
    return data
  },

  async createListing(
    assetId: string,
    payload: CreateListingPayload,
    idempotencyKey: string,
  ): Promise<Listing> {
    const { data } = await api.post<Listing>(`/api/v1/property-assets/${assetId}/listings`, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  async activateListing(assetId: string, listingId: string): Promise<Listing> {
    const { data } = await api.patch<Listing>(`/api/v1/property-assets/${assetId}/listings/${listingId}/activate`)
    return data
  },

  async publishListing(assetId: string, listingId: string, newAttempt = false): Promise<PublicationStatusResult> {
    if (newAttempt) {
      resetPublishIdempotencyKey(listingId)
    }
    const idempotencyKey = getPublishIdempotencyKey(listingId)
    try {
      const { data } = await api.post<PublicationStatusResult>(
        `/api/v1/property-assets/${assetId}/listings/${listingId}/publish`,
        {},
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      resetPublishIdempotencyKey(listingId)
      return data
    } catch (error) {
      // Upon network error or retry click, caller may decide to retry or reset key
      throw error
    }
  },

  async unpublishListing(assetId: string, listingId: string, payload: { reason: string } | string): Promise<PublicationStatusResult> {
    const reason = typeof payload === 'string' ? payload : payload.reason
    const { data } = await api.post<PublicationStatusResult>(
      `/api/v1/property-assets/${assetId}/listings/${listingId}/unpublish`,
      { reason },
    )
    return data
  },

  async getPublicationStatus(assetId: string, listingId: string): Promise<PublicationStatusResult> {
    const { data } = await api.get<PublicationStatusResult>(
      `/api/v1/property-assets/${assetId}/listings/${listingId}/publication-status`,
    )
    return data
  },

  async getActuality(assetId: string, listingId: string): Promise<ActualityStateResult> {
    const { data } = await api.get<ActualityStateResult>(
      `/api/v1/property-assets/${assetId}/listings/${listingId}/actuality`,
    )
    return data
  },

  async confirmActuality(assetId: string, listingId: string, payload: { expectedVersion: number } | number): Promise<ActualityStateResult> {
    const expectedVersion = typeof payload === 'number' ? payload : payload.expectedVersion
    const { data } = await api.patch<ActualityStateResult>(
      `/api/v1/property-assets/${assetId}/listings/${listingId}/confirm-actuality`,
      { expectedVersion },
    )
    return data
  },

  async getDuplicateCandidates(assetId: string): Promise<DuplicateCandidateResult[]> {
    const { data } = await api.get<DuplicateCandidateResult[]>(
      `/api/v1/property-assets/${assetId}/duplicate-candidates`,
    )
    return data
  },

  async overrideDuplicate(duplicateCandidateId: string, payload: { reason: string } | string): Promise<{ id: string; status: string }> {
    const reason = typeof payload === 'string' ? payload : payload.reason
    const { data } = await api.post<{ id: string; status: string }>(
      `/api/v1/property-assets/duplicate-candidates/${duplicateCandidateId}/override`,
      { reason },
    )
    return data
  },

  /**
   * Helper to load all assets and their listings for organization
   */
  async listAllAssetsWithListings(): Promise<{ items: PropertyAssetFullItem[]; total: number }> {
    const assets = await propertyAssetsApi.listAssets()
    const items = await Promise.all(
      assets.map(async (asset) => {
        try {
          const listings = await propertyAssetsApi.listListings(asset._id)
          return { asset, listings }
        } catch (error) {
          // ЧАСТИЧНАЯ мера. Сбой загрузки листингов неотличим от «листингов
          // нет»: объект с активной продажей отрисуется как без цены и статуса,
          // и его можно принять за черновик. Полное решение — помечать такой
          // элемент отдельным признаком и показывать это в списке, но оно
          // требует правки типа PropertyAssetFullItem и ObjectsListPage.
          // Пока хотя бы делаем сбой видимым в консоли, а не бесследным.
          console.error(`[propertyAssetsApi] listings failed for asset ${asset._id}:`, error)
          return { asset, listings: [] }
        }
      }),
    )
    return { items, total: items.length }
  },
}
