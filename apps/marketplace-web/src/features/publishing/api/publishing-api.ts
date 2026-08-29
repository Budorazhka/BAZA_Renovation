import type {
  LocationFormData,
  CharacteristicsFormData,
  DealFormData,
  DuplicateCandidate,
  ActualityState,
  PublicationStatusResult,
} from '../model/types'
import { resolveApiBaseUrl } from './api-base'

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

export class PublishingApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'PublishingApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errorJson = await response.json()
      errorDetail = errorJson.message || errorJson.error || response.statusText
    } catch {
      // Non-JSON
    }
    throw new PublishingApiError(errorDetail, response.status)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}

export const publishingApi = {
  async createPropertyAsset(data: {
    location: LocationFormData
    characteristics: CharacteristicsFormData
  }): Promise<{ _id: string; version: number }> {
    const payload = {
      propertyType: data.characteristics.propertyType,
      commercialSubtype:
        data.characteristics.propertyType === 'commercial' ? data.characteristics.commercialSubtype : undefined,
      location: {
        country: data.location.country || 'GE',
        city: data.location.city,
        address: data.location.address,
        geo: data.location.geo,
      },
      characteristics: {
        area: Number(data.characteristics.area),
        rooms: data.characteristics.rooms !== '' ? Number(data.characteristics.rooms) : undefined,
        floor: data.characteristics.floor !== '' ? Number(data.characteristics.floor) : undefined,
        totalFloors: data.characteristics.totalFloors !== '' ? Number(data.characteristics.totalFloors) : undefined,
      },
      representativePhone: data.characteristics.representativePhone,
    }

    return request<{ _id: string; version: number }>('/marketplace/property-assets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async createListing(
    assetId: string,
    deal: DealFormData,
  ): Promise<{ _id: string; dealType: string; status: string; version: number }> {
    const amountMinorUnits = Math.round(Number(deal.priceAmount) * 100)
    const payload = {
      dealType: deal.dealType,
      price: {
        amountMinorUnits,
        currency: deal.currency,
      },
    }

    return request<{ _id: string; dealType: string; status: string; version: number }>(
      `/marketplace/property-assets/${assetId}/listings`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  async activateListing(
    assetId: string,
    listingId: string,
  ): Promise<{ _id: string; status: string; version: number }> {
    return request<{ _id: string; status: string; version: number }>(
      `/marketplace/property-assets/${assetId}/listings/${listingId}/activate`,
      {
        method: 'PATCH',
      },
    )
  },

  // 3-Phase Media Vertical
  async createMediaUploadIntent(
    assetId: string,
    declaredMimeType: string,
    sizeBytes: number,
  ): Promise<{ mediaAssetId: string; uploadUrl: string }> {
    return request<{ mediaAssetId: string; uploadUrl: string }>(
      `/marketplace/property-assets/${assetId}/media/upload-intent`,
      {
        method: 'POST',
        body: JSON.stringify({ declaredMimeType, sizeBytes }),
      },
    )
  },

  async uploadBinaryFile(uploadUrl: string, file: File | Blob, mimeType: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: file,
    })

    if (!response.ok) {
      throw new PublishingApiError(`Failed to upload file to storage (${response.status})`, response.status)
    }
  },

  async confirmMediaUpload(
    assetId: string,
    mediaAssetId: string,
    options?: { role?: 'cover' | 'gallery'; alt?: string },
  ): Promise<any[]> {
    return request<any[]>(
      `/marketplace/property-assets/${assetId}/media/${mediaAssetId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      },
    )
  },

  async listMedia(assetId: string): Promise<any[]> {
    return request<any[]>(`/marketplace/property-assets/${assetId}/media`)
  },

  async deleteMedia(assetId: string, mediaAssetId: string): Promise<void> {
    return request<void>(`/marketplace/property-assets/${assetId}/media/${mediaAssetId}`, {
      method: 'DELETE',
    })
  },

  async updateMediaItem(
    assetId: string,
    mediaAssetId: string,
    dto: { role?: 'cover' | 'gallery'; alt?: string },
  ): Promise<any> {
    return request<any>(`/marketplace/property-assets/${assetId}/media/${mediaAssetId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    })
  },

  // Deduplication & Actuality
  async getDuplicateCandidates(assetId: string): Promise<DuplicateCandidate[]> {
    return request<DuplicateCandidate[]>(`/marketplace/property-assets/${assetId}/duplicate-candidates`)
  },

  async overrideDuplicate(duplicateCandidateId: string, reason: string): Promise<{ id: string; status: string }> {
    return request<{ id: string; status: string }>(
      `/marketplace/property-assets/duplicate-candidates/${duplicateCandidateId}/override`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    )
  },

  async getActuality(assetId: string, listingId: string): Promise<ActualityState> {
    return request<ActualityState>(
      `/marketplace/property-assets/${assetId}/listings/${listingId}/actuality`,
    )
  },

  async confirmActuality(assetId: string, listingId: string, expectedVersion: number): Promise<ActualityState> {
    return request<ActualityState>(
      `/marketplace/property-assets/${assetId}/listings/${listingId}/confirm-actuality`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    )
  },

  // Publish & Polling
  async publishListing(
    assetId: string,
    listingId: string,
    idempotencyKey: string,
  ): Promise<{ id: string; sourceType: string; sourceId: string; status: string }> {
    return request<{ id: string; sourceType: string; sourceId: string; status: string }>(
      `/marketplace/property-assets/${assetId}/listings/${listingId}/publish`,
      {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    )
  },

  async getPublicationStatus(assetId: string, listingId: string): Promise<PublicationStatusResult> {
    return request<PublicationStatusResult>(
      `/marketplace/property-assets/${assetId}/listings/${listingId}/publication-status`,
    )
  },
}
