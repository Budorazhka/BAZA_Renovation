import type { Property, PropertyCategory, PropertyType, SaleStatus } from '@/components/management/my-properties/types'
import type {
  PropertyAsset,
  Listing,
  PropertyAssetType,
  ListingDealType,
} from '@/services/propertyAssetsApi'

export type { PropertyAsset, Listing } from '@/services/propertyAssetsApi'

export interface PropertyWithAssetInfo extends Property {
  assetId: string
  rawAsset: PropertyAsset
  listings: Listing[]
  primaryListing?: Listing
  rawListing?: Listing
}

export function propertyAssetTypeToUi(type: PropertyAssetType): PropertyType {
  switch (type) {
    case 'apartment':
      return 'Квартира'
    case 'house':
      return 'Дом'
    case 'land':
      return 'Участок'
    case 'commercial':
      return 'Коммерция'
    default:
      return 'Квартира'
  }
}

export function uiPropertyTypeToAsset(type: string): PropertyAssetType {
  const t = type.toLowerCase()
  if (t.includes('дом') || t.includes('house') || t.includes('вилла') || t.includes('коттедж')) return 'house'
  if (t.includes('участ') || t.includes('land') || t.includes('земл')) return 'land'
  if (t.includes('коммерц') || t.includes('commercial') || t.includes('офис')) return 'commercial'
  return 'apartment'
}

export function listingStatusToUiSaleStatus(listing?: Listing): SaleStatus {
  if (!listing) return 'draft'
  switch (listing.status) {
    case 'active':
      return 'for_sale'
    case 'draft':
      return 'draft'
    case 'expired':
      return 'moderation'
    case 'archived':
      return 'archive'
    default:
      return 'draft'
  }
}

export function mapPropertyAssetToUiProperty(
  asset: PropertyAsset,
  listings: Listing[] = [],
): PropertyWithAssetInfo {
  // Find primary active or first listing
  const primaryListing = listings.find((l) => l.status === 'active') ?? listings[0]
  const dealType: ListingDealType = primaryListing?.dealType ?? 'sale'
  const isRent = dealType === 'rent_long' || dealType === 'rent_short'

  let category: PropertyCategory = 'secondary'
  if (isRent) {
    category = 'rent'
  } else if (asset.propertyType === 'commercial') {
    category = 'commercial'
  } else if (asset.propertyType === 'land' || asset.propertyType === 'house') {
    category = 'other'
  }

  const type = propertyAssetTypeToUi(asset.propertyType)
  const priceMinor = primaryListing?.price?.amountMinorUnits ?? 0
  const price = priceMinor > 0 ? priceMinor / 100 : 0
  const area = asset.characteristics.area || 1
  const pricePerM2 = Math.round(price / area)

  const rooms = asset.characteristics.rooms ?? 1
  const floor = asset.characteristics.floor ?? 1
  const totalFloors = asset.characteristics.totalFloors ?? 1

  const title = `${type} · ${asset.characteristics.area} м² · ${asset.location.city}, ${asset.location.address}`
  const listedAt = asset.createdAt ? new Date(asset.createdAt).toISOString() : new Date().toISOString()
  const updatedAt = primaryListing?.lastConfirmedAt
    ? new Date(primaryListing.lastConfirmedAt).toISOString()
    : asset.updatedAt
    ? new Date(asset.updatedAt).toISOString()
    : listedAt

  const coords = asset.location.geo?.coordinates ?? [0, 0]

  return {
    id: asset._id,
    assetId: asset._id,
    title,
    type,
    category,
    country: asset.location.country || 'Грузия',
    city: asset.location.city || '',
    street: asset.location.address || '',
    floor,
    totalFloors,
    rooms,
    area: asset.characteristics.area,
    price,
    pricePerM2,
    listedAt,
    updatedAt,
    status: listingStatusToUiSaleStatus(primaryListing),
    agentId: asset.publisherScope.organizationId,
    agentName: 'Организация',
    rawAsset: asset,
    listings,
    primaryListing,
    rawListing: primaryListing,
    details: {
      searchValue: `${title} ${asset.location.city} ${asset.location.address}`,
      summary: title,
      description: '',
      address: asset.location.address,
      mapLocationLabel: `${asset.location.city}, ${asset.location.address}`,
      mapLat: String(coords[1] || ''),
      mapLng: String(coords[0] || ''),
      views: [],
      roadType: '',
      shoreline: '',
      renovation: '',
      bathroomType: '',
      bathroomsCount: '1',
      balconyType: '',
      ceilingHeight: '',
      planFileName: '',
      mediaFileNames: [],
      elevatorOptions: [],
      parkingOptions: [],
      propertyUsage: [],
      wallMaterial: '',
      gas: '',
      waterSupply: '',
      sewage: '',
      landType: '',
      electricity: '',
      amenities: [],
      commissionPercent: '0',
      sellerType: 'owner',
      mortgageAvailable: false,
      installmentAvailable: false,
      priceOnRequest: price === 0,
      isMls: false,
    },
  }
}
