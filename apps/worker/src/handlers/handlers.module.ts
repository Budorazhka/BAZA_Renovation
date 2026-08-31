import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaAssetDocument, MediaAssetSchema, MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import { DevelopmentDocument, DevelopmentSchema, DevelopmentRepository } from '@baza/development';
import {
  PropertyAssetDocument,
  PropertyAssetSchema,
  PropertyAssetRepository,
  ListingDocument,
  ListingSchema,
  ListingRepository,
} from '@baza/property-assets';
import {
  MarketplacePublicationDocument,
  MarketplacePublicationSchema,
  MarketplacePublicationRepository,
} from '@baza/publication';
import { OutboxModule } from '../outbox/outbox.module';
import { EventHandlerRegistry } from '../outbox/event-handler.registry';
import { MediaVerifiedHandler } from './media-verified.handler';
import { PositionOccupantAssignedHandler } from './position-occupant-assigned.handler';
import { PublicationRequestedHandler } from './publication-requested.handler';
import { BookingCreatedHandler } from './booking-created.handler';
import { ImageVariantService } from './image-variant.service';

/**
 * Регистрация handler'ов в EventHandlerRegistry при старте приложения —
 * новый handler добавляется здесь (provider + register() вызов), не
 * требует правки OutboxPollerService/EventHandlerRegistry самих по себе.
 */
@Module({
  imports: [
    OutboxModule,
    MongooseModule.forFeature([
      { name: MediaAssetDocument.name, schema: MediaAssetSchema },
      { name: DevelopmentDocument.name, schema: DevelopmentSchema },
      { name: PropertyAssetDocument.name, schema: PropertyAssetSchema },
      { name: ListingDocument.name, schema: ListingSchema },
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
    ]),
  ],
  providers: [
    MediaAssetRepository,
    MediaStorageService,
    ImageVariantService,
    DevelopmentRepository,
    PropertyAssetRepository,
    ListingRepository,
    MarketplacePublicationRepository,
    MediaVerifiedHandler,
    PositionOccupantAssignedHandler,
    PublicationRequestedHandler,
    BookingCreatedHandler,
  ],
})
export class HandlersModule implements OnModuleInit {
  constructor(
    private readonly registry: EventHandlerRegistry,
    private readonly mediaVerifiedHandler: MediaVerifiedHandler,
    private readonly positionOccupantAssignedHandler: PositionOccupantAssignedHandler,
    private readonly publicationRequestedHandler: PublicationRequestedHandler,
    private readonly bookingCreatedHandler: BookingCreatedHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('MediaVerified', this.mediaVerifiedHandler);
    this.registry.register('PositionOccupantAssigned', this.positionOccupantAssignedHandler);
    this.registry.register('PublicationRequested', this.publicationRequestedHandler);
    this.registry.register('BookingCreated', this.bookingCreatedHandler);
  }
}
