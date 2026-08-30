export type WizardStep =
  | 'auth'
  | 'location'
  | 'characteristics'
  | 'deal'
  | 'media'
  | 'review'
  | 'publishing'
  | 'published'

export type PropertyType = 'apartment' | 'house' | 'land' | 'commercial'
export type CommercialSubtype = 'office' | 'warehouse' | 'retail' | 'business' | 'free_purpose'
export type DealType = 'sale' | 'rent_long' | 'rent_short'
export type CurrencyCode = 'USD' | 'GEL' | 'RUB'

export interface GeoPoint {
  type: 'Point'
  coordinates: [number, number] // [longitude, latitude]
}

export interface LocationFormData {
  country: string
  city: string
  address: string
  geo: GeoPoint
}

export interface CharacteristicsFormData {
  propertyType: PropertyType
  commercialSubtype?: CommercialSubtype
  area: number | ''
  rooms: number | ''
  floor: number | ''
  totalFloors: number | ''
  representativePhone: string
}

export interface DealFormData {
  dealType: DealType
  priceAmount: number | ''
  currency: CurrencyCode
}

export interface WizardMediaItem {
  id: string
  mediaAssetId: string
  url?: string
  role: 'cover' | 'gallery'
  sortOrder: number
  alt?: string
  status: 'pending' | 'uploading' | 'verified' | 'rejected'
  progressPercent?: number
  isPrivate?: boolean
  // Which 3-phase upload step failed, so a retry can resume there instead of
  // restarting the whole upload (and re-running phase 1 for a file that
  // already has a real backend upload-intent from a previous attempt).
  failedPhase?: 'intent' | 'upload' | 'confirm'
}

export interface DuplicateCandidate {
  id: string
  status: 'detected' | 'confirmed_duplicate' | 'override_not_duplicate'
  signals: {
    phoneMatch?: boolean
    addressMatch?: boolean
    geoDistanceMeters?: number
    roomsAreaFloorMatch?: boolean
  }
  overrideReason?: string
  overrideAt?: string
  detectedAt?: string
}

export interface ActualityState {
  listingId: string
  category: string
  thresholds?: { warningDays: number; overdueDays: number }
  lastConfirmedAt?: string
  version: number
  status: 'draft' | 'active' | 'expired' | 'archived' | 'confirmed' | 'needs_confirmation'
  state?: 'up_to_date' | 'needs_attention' | 'needs_update' | 'fresh' | 'warning' | 'overdue' | null
}

export interface PublicationStatusResult {
  publicationId: string
  status: 'publication_pending' | 'published' | 'build_failed' | 'unpublished'
  slug?: string
  version: number
  publishedAt?: string
  unpublishedAt?: string
  unpublishReason?: string
}

export interface WizardState {
  step: WizardStep
  isAuthenticated: boolean
  identityId?: string

  // Step Data
  location: LocationFormData
  characteristics: CharacteristicsFormData
  deal: DealFormData

  // Backend Entity IDs
  assetId?: string
  listingId?: string
  publicationId?: string
  publishedSlug?: string

  // Media
  mediaItems: WizardMediaItem[]
  isUploadingMedia: boolean

  // Duplicate & Actuality
  duplicateCandidates: DuplicateCandidate[]
  hasDuplicateBlock: boolean
  overrideReason: string
  isSubmittingOverride: boolean
  actualityState?: ActualityState

  // Publishing & Polling
  isPublishing: boolean
  publicationStatus?: 'publication_pending' | 'published' | 'build_failed' | 'unpublished'

  // Global UX state
  isLoading: boolean
  error: string | null
}
