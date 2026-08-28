export interface PublicLocation {
  country?: string
  city?: string
  address?: string
}

export interface PublicDevelopmentCard {
  slug?: string
  name?: string
  location?: PublicLocation
  classType?: string
  completionDate?: string
  description?: string
  seo?: {
    title?: string
    description?: string
    canonicalUrl?: string
  }
}

export interface PublicDevelopmentList {
  items: PublicDevelopmentCard[]
  nextCursor: string | null
}

export interface BoundingBox {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface CatalogueQuery {
  city?: string
  cursor?: string
  limit?: number
  /** D-04A: карта (MKT-SCR-005) Figma-blocked — data-layer готов, UI-потребителя пока нет. */
  bbox?: BoundingBox
}

export type ListingDealType = 'sale' | 'rent_long' | 'rent_short'
export type ListingPropertyType = 'apartment' | 'house' | 'land' | 'commercial'

export interface PublicListingPrice {
  amountMinorUnits?: number
  currency?: string
}

export interface PublicListingCharacteristics {
  area?: number
  rooms?: number
  floor?: number
  totalFloors?: number
}

export interface PublicListingCard {
  slug?: string
  dealType?: ListingDealType
  price?: PublicListingPrice
  propertyType?: ListingPropertyType
  commercialSubtype?: string
  location?: PublicLocation
  characteristics?: PublicListingCharacteristics
  seo?: {
    title?: string
    description?: string
    canonicalUrl?: string
    structuredData?: Record<string, unknown>
  }
}

export interface PublicListingList {
  items: PublicListingCard[]
  nextCursor: string | null
}

export interface ListingCatalogueQuery {
  city?: string
  dealType?: ListingDealType
  propertyType?: ListingPropertyType
  commercialSubtype?: string
  cursor?: string
  limit?: number
  bbox?: BoundingBox
}

