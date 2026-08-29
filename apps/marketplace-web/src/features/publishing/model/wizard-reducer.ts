import type {
  WizardState,
  WizardStep,
  LocationFormData,
  CharacteristicsFormData,
  DealFormData,
  WizardMediaItem,
  DuplicateCandidate,
  ActualityState,
} from './types'

export const initialWizardState: WizardState = {
  step: 'auth',
  isAuthenticated: false,
  identityId: undefined,

  location: {
    country: 'Georgia',
    city: 'Batumi',
    address: '',
    geo: {
      type: 'Point',
      coordinates: [41.6367, 41.6434], // Batumi center [longitude, latitude]
    },
  },

  characteristics: {
    propertyType: 'apartment',
    commercialSubtype: undefined,
    area: '',
    rooms: '',
    floor: '',
    totalFloors: '',
    representativePhone: '',
  },

  deal: {
    dealType: 'sale',
    priceAmount: '',
    currency: 'USD',
  },

  assetId: undefined,
  listingId: undefined,
  publicationId: undefined,
  publishedSlug: undefined,

  mediaItems: [],
  isUploadingMedia: false,

  duplicateCandidates: [],
  hasDuplicateBlock: false,
  overrideReason: '',
  isSubmittingOverride: false,
  actualityState: undefined,

  isPublishing: false,
  publicationStatus: undefined,

  isLoading: false,
  error: null,
}

export type WizardAction =
  | { type: 'SET_AUTH_STATUS'; isAuthenticated: boolean; identityId?: string }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'UPDATE_LOCATION'; payload: Partial<LocationFormData> }
  | { type: 'UPDATE_CHARACTERISTICS'; payload: Partial<CharacteristicsFormData> }
  | { type: 'UPDATE_DEAL'; payload: Partial<DealFormData> }
  | { type: 'SET_ASSET_ID'; assetId: string }
  | { type: 'SET_LISTING_ID'; listingId: string }
  | { type: 'SET_MEDIA_ITEMS'; items: WizardMediaItem[] }
  | { type: 'ADD_MEDIA_ITEM'; item: WizardMediaItem }
  | { type: 'UPDATE_MEDIA_ITEM'; id: string; payload: Partial<WizardMediaItem> }
  | { type: 'REMOVE_MEDIA_ITEM'; id: string }
  | { type: 'SET_UPLOADING_MEDIA'; isUploading: boolean }
  | { type: 'SET_DUPLICATES'; candidates: DuplicateCandidate[] }
  | { type: 'SET_OVERRIDE_REASON'; reason: string }
  | { type: 'SET_SUBMITTING_OVERRIDE'; isSubmitting: boolean }
  | { type: 'SET_ACTUALITY'; actuality: ActualityState }
  | { type: 'SET_PUBLISHING'; isPublishing: boolean }
  | {
      type: 'SET_PUBLICATION_STATUS'
      status: 'publication_pending' | 'published' | 'build_failed' | 'unpublished'
      slug?: string
      publicationId?: string
    }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET_WIZARD' }

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_AUTH_STATUS':
      return {
        ...state,
        isAuthenticated: action.isAuthenticated,
        identityId: action.identityId,
        step: action.isAuthenticated && state.step === 'auth' ? 'location' : !action.isAuthenticated ? 'auth' : state.step,
      }

    case 'SET_STEP':
      return {
        ...state,
        step: action.step,
        error: null,
      }

    case 'UPDATE_LOCATION':
      return {
        ...state,
        location: {
          ...state.location,
          ...action.payload,
        },
      }

    case 'UPDATE_CHARACTERISTICS':
      return {
        ...state,
        characteristics: {
          ...state.characteristics,
          ...action.payload,
        },
      }

    case 'UPDATE_DEAL':
      return {
        ...state,
        deal: {
          ...state.deal,
          ...action.payload,
        },
      }

    case 'SET_ASSET_ID':
      return {
        ...state,
        assetId: action.assetId,
      }

    case 'SET_LISTING_ID':
      return {
        ...state,
        listingId: action.listingId,
      }

    case 'SET_MEDIA_ITEMS':
      return {
        ...state,
        mediaItems: action.items,
      }

    case 'ADD_MEDIA_ITEM':
      return {
        ...state,
        mediaItems: [...state.mediaItems, action.item],
      }

    case 'UPDATE_MEDIA_ITEM':
      return {
        ...state,
        mediaItems: state.mediaItems.map((item) =>
          item.id === action.id || item.mediaAssetId === action.id ? { ...item, ...action.payload } : item,
        ),
      }

    case 'REMOVE_MEDIA_ITEM':
      return {
        ...state,
        mediaItems: state.mediaItems.filter((item) => item.id !== action.id && item.mediaAssetId !== action.id),
      }

    case 'SET_UPLOADING_MEDIA':
      return {
        ...state,
        isUploadingMedia: action.isUploading,
      }

    case 'SET_DUPLICATES': {
      const hasBlock = action.candidates.some(
        (c) => c.status === 'detected' || c.status === 'confirmed_duplicate',
      )
      return {
        ...state,
        duplicateCandidates: action.candidates,
        hasDuplicateBlock: hasBlock,
      }
    }

    case 'SET_OVERRIDE_REASON':
      return {
        ...state,
        overrideReason: action.reason,
      }

    case 'SET_SUBMITTING_OVERRIDE':
      return {
        ...state,
        isSubmittingOverride: action.isSubmitting,
      }

    case 'SET_ACTUALITY':
      return {
        ...state,
        actualityState: action.actuality,
      }

    case 'SET_PUBLISHING':
      return {
        ...state,
        isPublishing: action.isPublishing,
      }

    case 'SET_PUBLICATION_STATUS':
      return {
        ...state,
        publicationStatus: action.status,
        publishedSlug: action.slug || state.publishedSlug,
        publicationId: action.publicationId || state.publicationId,
        step: action.status === 'published' ? 'published' : state.step,
      }

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.isLoading,
      }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
        isLoading: false,
        isPublishing: false,
      }

    case 'RESET_WIZARD':
      return {
        ...initialWizardState,
        isAuthenticated: state.isAuthenticated,
        identityId: state.identityId,
        step: state.isAuthenticated ? 'location' : 'auth',
      }

    default:
      return state
  }
}
