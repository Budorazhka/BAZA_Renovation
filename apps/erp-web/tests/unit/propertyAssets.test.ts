import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapPropertyAssetToUiProperty,
  uiPropertyTypeToAsset,
} from '../../src/lib/map-property-asset'
import {
  propertyAssetsApi,
  getPublishIdempotencyKey,
  resetPublishIdempotencyKey,
  type PropertyAsset,
  type Listing,
} from '../../src/services/propertyAssetsApi'

describe('Property Assets Vertical — ERP Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const sampleAsset: PropertyAsset = {
    _id: 'asset-123',
    publisherScope: { type: 'organization', organizationId: 'org-456' },
    propertyType: 'apartment',
    location: {
      country: 'Грузия',
      city: 'Батуми',
      address: 'ул. Горгиладзе, 10',
      geo: { type: 'Point', coordinates: [41.64, 41.64] },
    },
    characteristics: {
      area: 65,
      rooms: 2,
      floor: 7,
      totalFloors: 16,
    },
    representativePhone: '+995500123456',
    version: 1,
    createdAt: '2026-03-01T10:00:00.000Z',
  }

  const sampleListing: Listing = {
    _id: 'listing-789',
    propertyAssetId: 'asset-123',
    publisherScope: { type: 'organization', organizationId: 'org-456' },
    dealType: 'sale',
    price: {
      amountMinorUnits: 8500000,
      currency: 'USD',
    },
    status: 'active',
    slug: 'batumi-2k-gorgiladze-10-85000',
    version: 2,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-02T12:00:00.000Z',
  }

  it('maps property asset and listing to ERP UI property model', () => {
    const uiProperty = mapPropertyAssetToUiProperty(sampleAsset, [sampleListing])

    expect(uiProperty.id).toBe('asset-123')
    expect(uiProperty.title).toBe('Квартира · 65 м² · Батуми, ул. Горгиладзе, 10')
    expect(uiProperty.category).toBe('secondary')
    expect(uiProperty.type).toBe('Квартира')
    expect(uiProperty.price).toBe(85000)
    expect(uiProperty.pricePerM2).toBe(Math.round(85000 / 65))
    expect(uiProperty.status).toBe('for_sale')
    expect(uiProperty.country).toBe('Грузия')
    expect(uiProperty.city).toBe('Батуми')
    expect(uiProperty.street).toBe('ул. Горгиладзе, 10')
    expect(uiProperty.rooms).toBe(2)
    expect(uiProperty.area).toBe(65)
    expect(uiProperty.floor).toBe(7)
    expect(uiProperty.totalFloors).toBe(16)
    expect(uiProperty.rawAsset).toBe(sampleAsset)
    expect(uiProperty.rawListing).toBe(sampleListing)
  })

  it('maps rent listing dealType to rent category', () => {
    const rentListing: Listing = {
      ...sampleListing,
      dealType: 'rent_long',
      price: { amountMinorUnits: 90000, currency: 'USD' },
    }
    const uiProperty = mapPropertyAssetToUiProperty(sampleAsset, [rentListing])
    expect(uiProperty.category).toBe('rent')
    expect(uiProperty.price).toBe(900)
  })

  it('maps commercial propertyType to commercial category', () => {
    const commercialAsset: PropertyAsset = {
      ...sampleAsset,
      propertyType: 'commercial',
      commercialSubtype: 'office',
    }
    const uiProperty = mapPropertyAssetToUiProperty(commercialAsset, [sampleListing])
    expect(uiProperty.category).toBe('commercial')
    expect(uiProperty.type).toBe('Коммерция')
  })

  it('maps UI property types back to asset domain types', () => {
    expect(uiPropertyTypeToAsset('Квартира')).toBe('apartment')
    expect(uiPropertyTypeToAsset('Дом')).toBe('house')
    expect(uiPropertyTypeToAsset('Участок')).toBe('land')
    expect(uiPropertyTypeToAsset('Коммерция')).toBe('commercial')
    expect(uiPropertyTypeToAsset('Пентхаус')).toBe('apartment')
  })

  it('generates and persists idempotency key per listing attempt', () => {
    const listingId = 'listing-test-123'
    resetPublishIdempotencyKey(listingId)
    const key1 = getPublishIdempotencyKey(listingId)
    const key2 = getPublishIdempotencyKey(listingId)

    expect(key1).toBeTruthy()
    expect(key1).toBe(key2)

    resetPublishIdempotencyKey(listingId)
    const key3 = getPublishIdempotencyKey(listingId)
    expect(key3).not.toBe(key1)
  })

  it('provides methods for full property vertical flow', () => {
    expect(typeof propertyAssetsApi.listAssets).toBe('function')
    expect(typeof propertyAssetsApi.getAsset).toBe('function')
    expect(typeof propertyAssetsApi.createAsset).toBe('function')
    expect(typeof propertyAssetsApi.listListings).toBe('function')
    expect(typeof propertyAssetsApi.createListing).toBe('function')
    expect(typeof propertyAssetsApi.activateListing).toBe('function')
    expect(typeof propertyAssetsApi.publishListing).toBe('function')
    expect(typeof propertyAssetsApi.unpublishListing).toBe('function')
    expect(typeof propertyAssetsApi.getPublicationStatus).toBe('function')
    expect(typeof propertyAssetsApi.confirmActuality).toBe('function')
    expect(typeof propertyAssetsApi.getDuplicateCandidates).toBe('function')
    expect(typeof propertyAssetsApi.overrideDuplicate).toBe('function')
    expect(typeof propertyAssetsApi.listAllAssetsWithListings).toBe('function')
  })
})
