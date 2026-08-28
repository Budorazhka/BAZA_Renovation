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
