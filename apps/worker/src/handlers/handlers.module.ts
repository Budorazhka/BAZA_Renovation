import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaAssetDocument, MediaAssetSchema, MediaAssetRepository, MediaStorageService } from '@baza/media-storage';
import { DevelopmentDocument, DevelopmentSchema, DevelopmentRepository } from '@baza/development';
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
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
    ]),
  ],
  providers: [
    MediaAssetRepository,
    MediaStorageService,
    ImageVariantService,
    DevelopmentRepository,
    MarketplacePublicationRepository,
    MediaVerifiedHandler,
    PositionOccupantAssignedHandler,
    PublicationRequestedHandler,
  ],
})
export class HandlersModule implements OnModuleInit {
  constructor(
    private readonly registry: EventHandlerRegistry,
    private readonly mediaVerifiedHandler: MediaVerifiedHandler,
    private readonly positionOccupantAssignedHandler: PositionOccupantAssignedHandler,
    private readonly publicationRequestedHandler: PublicationRequestedHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('MediaVerified', this.mediaVerifiedHandler);
    this.registry.register('PositionOccupantAssigned', this.positionOccupantAssignedHandler);
    this.registry.register('PublicationRequested', this.publicationRequestedHandler);
  }
}
