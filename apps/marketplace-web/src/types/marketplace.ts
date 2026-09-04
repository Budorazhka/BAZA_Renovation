export interface PublicMediaItem {
  url: string
  role: 'cover' | 'gallery'
  sortOrder: number
  alt?: string
}

export interface PublicLocation {
  country?: string
  city?: string
  address?: string
  geo?: PublicGeoPoint
}

export interface PublicGeoPoint {
  type: 'Point'
  coordinates: [number, number]
}

/**
 * Публикатор объекта: застройщик или агентство.
 *
 * Отдельных публичных страниц у них нет (решение владельца от 04.09.2026, как
 * на действующем baza.sale) — клик по названию ведёт в каталог,
 * отфильтрованный по `id`. У объектов частных собственников поле пустое.
 */
export interface PublicPublisher {
  id: string
  name: string
  type: string
}

export interface PublicDevelopmentCard {
  slug?: string
  name?: string
  location?: PublicLocation
  classType?: string
  completionDate?: string
  description?: string
  publisher?: PublicPublisher
  seo?: {
    title?: string
    description?: string
    canonicalUrl?: string
  }
}

export interface PublicDevelopmentList {
  items: PublicDevelopmentCard[]
  nextCursor: string | null
  total: number
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
  /** MKT-SCR-005: map viewport filter, serialized as minLng,minLat,maxLng,maxLat. */
  bbox?: BoundingBox
  /** Фильтр «объекты этого застройщика»: id организации-публикатора. */
  publisher?: string
  sort?: 'newest'
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
  media?: PublicMediaItem[]
  isVerified?: boolean
  publisher?: PublicPublisher
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
  total: number
}

export type PublicListingSort = 'newest' | 'price_asc' | 'price_desc' | 'area_asc' | 'area_desc'

export interface ListingCatalogueQuery {
  city?: string
  dealType?: ListingDealType
  propertyType?: ListingPropertyType
  commercialSubtype?: string
  cursor?: string
  limit?: number
  bbox?: BoundingBox
  sort?: PublicListingSort
  /** Фильтр «объявления этой компании»: id организации-публикатора. */
  publisher?: string
}

