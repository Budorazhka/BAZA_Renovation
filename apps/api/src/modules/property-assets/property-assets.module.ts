import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PropertyAssetDocument,
  PropertyAssetSchema,
  PropertyAssetRepository,
  ListingDocument,
  ListingSchema,
  ListingRepository,
  DuplicateCandidateDocument,
  DuplicateCandidateSchema,
  DuplicateCandidateRepository,
  ListingRevisionDocument,
  ListingRevisionSchema,
  ListingRevisionRepository,
  ComplaintDocument,
  ComplaintSchema,
  ComplaintRepository,
} from '@baza/property-assets';
import { PropertyAssetsService } from './property-assets.service';
import { PropertyAssetsController } from './property-assets.controller';
import { MarketplacePropertyAssetsService } from './marketplace-property-assets.service';
import { MarketplacePropertyAssetsController } from './marketplace-property-assets.controller';
import { DedupeService } from './dedupe.service';
import { ActualityService } from './actuality.service';
import { ComplaintService } from './complaint.service';
import { PublicComplaintController } from './public-complaint.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PublicationModule } from '../publication/publication.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PropertyAssetDocument.name, schema: PropertyAssetSchema },
      { name: ListingDocument.name, schema: ListingSchema },
      { name: DuplicateCandidateDocument.name, schema: DuplicateCandidateSchema },
      { name: ListingRevisionDocument.name, schema: ListingRevisionSchema },
      { name: ComplaintDocument.name, schema: ComplaintSchema },
    ]),
    AuthorizationModule,
    PublicationModule,
    IdempotencyModule,
    AuditModule,
    MediaModule,
    RateLimitModule,
  ],
  controllers: [PropertyAssetsController, MarketplacePropertyAssetsController, PublicComplaintController],
  providers: [
    PropertyAssetRepository,
    ListingRepository,
    DuplicateCandidateRepository,
    ListingRevisionRepository,
    ComplaintRepository,
    DedupeService,
    ActualityService,
    ComplaintService,
    PropertyAssetsService,
    MarketplacePropertyAssetsService,
  ],
  exports: [ActualityService, DedupeService, ComplaintService],
})
export class PropertyAssetsModule {}
