/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllAssetsWithListingsMock = vi.fn()
const legacyAuthorPageMock = vi.fn()
const legacyAuthorTotalMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: null }),
}))

vi.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}))

vi.mock('@/components/objects/ObjectEditWizard', () => ({ ObjectEditWizard: () => null }))
vi.mock('@/components/objects/MlsConfirmDialog', () => ({ MlsConfirmDialog: () => null }))
vi.mock('@/components/objects/MlsJoinDialog', () => ({ MlsJoinDialog: () => null }))
vi.mock('@/components/objects/ObjectPhotoCarousel', () => ({ ObjectPhotoCarousel: () => null }))
vi.mock('@/components/objects/favorites-store', () => ({
  useFavorites: () => new Set<string>(),
  toggleFavorite: vi.fn(),
}))

vi.mock('@/services/propertyAssetsApi', () => ({
  propertyAssetsApi: {
    listAllAssetsWithListings: listAllAssetsWithListingsMock,
  },
}))

vi.mock('@/services/secondaryObjectsApi', () => ({
  CATALOG_PAGE_SIZE: 20,
  hasCatalogFilters: () => false,
  secondaryObjectsApi: {
    resolveAuthorUserId: () => 'legacy-user',
    getAuthorCatalogTotal: legacyAuthorTotalMock,
    fetchAuthorCatalogPage: legacyAuthorPageMock,
  },
}))

const platformAsset = {
  _id: 'asset-1',
  publisherScope: { type: 'organization' as const, organizationId: 'org-1' },
  propertyType: 'apartment' as const,
  location: {
    country: 'GE',
    city: 'Батуми',
    address: 'ул. Руставели, 7',
    geo: { type: 'Point' as const, coordinates: [41.6367, 41.6459] as [number, number] },
  },
  characteristics: { area: 65, rooms: 2, floor: 7, totalFloors: 16 },
  representativePhone: '+995555000000',
  version: 1,
  createdAt: '2026-08-30T10:00:00.000Z',
}

const platformListing = {
  _id: 'listing-1',
  propertyAssetId: 'asset-1',
  publisherScope: { type: 'organization' as const, organizationId: 'org-1' },
  dealType: 'sale' as const,
  price: { amountMinorUnits: 8500000, currency: 'USD' as const },
  status: 'active' as const,
  version: 1,
  createdAt: '2026-08-30T10:00:00.000Z',
}

describe('ObjectsListPage — Platform source', () => {
  beforeEach(() => {
    listAllAssetsWithListingsMock.mockReset()
    legacyAuthorPageMock.mockReset()
    legacyAuthorTotalMock.mockReset()
    listAllAssetsWithListingsMock.mockResolvedValue({
      items: [{ asset: platformAsset, listings: [platformListing] }],
      total: 1,
    })
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('загружает список вторички через scoped Platform asset/listing и не вызывает legacy author catalog', async () => {
    const { ObjectsListPage } = await import('@/components/objects/ObjectsListPage')
    render(createElement(ObjectsListPage))

    await waitFor(() => expect(listAllAssetsWithListingsMock).toHaveBeenCalledTimes(1))
    expect(legacyAuthorPageMock).not.toHaveBeenCalled()
    expect(legacyAuthorTotalMock).not.toHaveBeenCalled()
    expect(screen.getByText(/Квартира.*65 м²/)).toBeDefined()
  })
})
