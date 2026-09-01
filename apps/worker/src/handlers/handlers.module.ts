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
import { BookingCancelledHandler } from './booking-cancelled.handler';
import { BookingConfirmedHandler } from './booking-confirmed.handler';
import { BookingExtendedHandler } from './booking-extended.handler';
import { AcknowledgedEventHandler } from './acknowledged-event.handler';
import { ImageVariantService } from './image-variant.service';

/**
 * Типы событий, которые публикуются, но пока не имеют побочного эффекта.
 * Подтверждаются общим AcknowledgedEventHandler — см. его докстринг о том,
 * почему отсутствие handler'а хуже, чем no-op handler.
 *
 * Экспортируется, чтобы страж (handlers-coverage.spec.ts) мог сверить этот
 * список с тем, что реально публикуется в коде.
 */
export const ACKNOWLEDGED_ONLY_EVENT_TYPES = [
  'PositionVacated',
  'TaskCreated',
  'TaskCompleted',
  'TaskReassigned',
  'UnitPriceChanged',
  'UnitStatusChanged',
  'UnpublicationRequested',
] as const;

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
    BookingCancelledHandler,
    BookingConfirmedHandler,
    BookingExtendedHandler,
    AcknowledgedEventHandler,
  ],
})
export class HandlersModule implements OnModuleInit {
  constructor(
    private readonly registry: EventHandlerRegistry,
    private readonly mediaVerifiedHandler: MediaVerifiedHandler,
    private readonly positionOccupantAssignedHandler: PositionOccupantAssignedHandler,
    private readonly publicationRequestedHandler: PublicationRequestedHandler,
    private readonly bookingCreatedHandler: BookingCreatedHandler,
    private readonly bookingCancelledHandler: BookingCancelledHandler,
    private readonly bookingConfirmedHandler: BookingConfirmedHandler,
    private readonly bookingExtendedHandler: BookingExtendedHandler,
    private readonly acknowledgedEventHandler: AcknowledgedEventHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('MediaVerified', this.mediaVerifiedHandler);
    this.registry.register('PositionOccupantAssigned', this.positionOccupantAssignedHandler);
    this.registry.register('PublicationRequested', this.publicationRequestedHandler);
    this.registry.register('BookingCreated', this.bookingCreatedHandler);
    this.registry.register('BookingCancelled', this.bookingCancelledHandler);
    this.registry.register('BookingConfirmed', this.bookingConfirmedHandler);
    this.registry.register('BookingExtended', this.bookingExtendedHandler);

    // События без специфицированного побочного эффекта. До 01.09.2026 у них
    // не было handler'а вообще, и каждое такое событие уходило прямо в
    // dead_letter (OutboxPollerService при отсутствии handler'а сразу
    // выставляет attempts = MAX_ATTEMPTS). Среди них рутинные TaskCreated/
    // TaskCompleted/UnitPriceChanged — то есть очередь «поломок» полнилась
    // при обычной работе и переставала быть сигналом о настоящем сбое.
    //
    // Появится реальный side-effect — тип переезжает в собственный handler
    // и убирается отсюда. Соответствие этого списка тому, что реально
    // публикуется, стережёт handlers-coverage.spec.ts.
    for (const eventType of ACKNOWLEDGED_ONLY_EVENT_TYPES) {
      this.registry.register(eventType, this.acknowledgedEventHandler);
    }
  }
}
