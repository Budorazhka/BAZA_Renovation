export {
  PropertyAssetDocument,
  PropertyAssetSchema,
  type PropertyType,
  type CommercialSubtype,
  type PropertyAssetMediaRole,
  type PropertyAssetMediaItem,
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
export {
  ListingRevisionDocument,
  ListingRevisionSchema,
  type ListingRevisionActorType,
  type ListingRevisionChangeType,
  type ListingRevisionCharacteristicsSnapshot,
  type ListingRevisionPriceSnapshot,
} from './schemas/listing-revision.schema';
export {
  ListingRevisionRepository,
  type RecordListingRevisionInput,
} from './repository/listing-revision.repository';
export {
  ComplaintDocument,
  ComplaintSchema,
  type ComplaintCategory,
  type ComplaintStatus,
} from './schemas/complaint.schema';
export { ComplaintRepository, type CreateComplaintInput } from './repository/complaint.repository';
