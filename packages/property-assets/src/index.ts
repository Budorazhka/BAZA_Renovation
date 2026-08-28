export {
  PropertyAssetDocument,
  PropertyAssetSchema,
  type PropertyType,
  type CommercialSubtype,
} from './schemas/property-asset.schema';
export { PropertyAssetRepository, type CreatePropertyAssetInput } from './repository/property-asset.repository';
export {
  ListingDocument,
  ListingSchema,
  type ListingDealType,
  type ListingStatus,
} from './schemas/listing.schema';
export { ListingRepository, type CreateListingInput } from './repository/listing.repository';
export {
  DuplicateCandidateDocument,
  DuplicateCandidateSchema,
  type DuplicateCandidateStatus,
} from './schemas/duplicate-candidate.schema';
export { DuplicateCandidateRepository, type DuplicateSignals } from './repository/duplicate-candidate.repository';
export { computeDuplicateSignals, isExplicitDuplicateSignal, normalizePhone, normalizeAddress } from './dedupe.util';
export {
  type ActualityState,
  type ActualityCategory,
  resolveActualityCategory,
  getActualityThresholds,
  computeActualityState,
} from './actuality.util';
