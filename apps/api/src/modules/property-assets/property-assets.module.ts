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
} from '@baza/property-assets';
import { PropertyAssetsService } from './property-assets.service';
import { PropertyAssetsController } from './property-assets.controller';
import { MarketplacePropertyAssetsService } from './marketplace-property-assets.service';
import { MarketplacePropertyAssetsController } from './marketplace-property-assets.controller';
import { DedupeService } from './dedupe.service';
import { ActualityService } from './actuality.service';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PublicationModule } from '../publication/publication.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PropertyAssetDocument.name, schema: PropertyAssetSchema },
      { name: ListingDocument.name, schema: ListingSchema },
      { name: DuplicateCandidateDocument.name, schema: DuplicateCandidateSchema },
    ]),
    AuthorizationModule,
    PublicationModule,
    IdempotencyModule,
    AuditModule,
    MediaModule,
  ],
  controllers: [PropertyAssetsController, MarketplacePropertyAssetsController],
  providers: [
    PropertyAssetRepository,
    ListingRepository,
    DuplicateCandidateRepository,
    DedupeService,
    ActualityService,
    PropertyAssetsService,
    MarketplacePropertyAssetsService,
  ],
  exports: [ActualityService, DedupeService],
})
export class PropertyAssetsModule {}
