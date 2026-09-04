import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MarketplacePublicationDocument,
  MarketplacePublicationSchema,
  MarketplacePublicationRepository,
} from '@baza/publication';
import { PublicationService } from './publication.service';
import { PublicController } from './public.controller';
import { PublicListingsController } from './public-listings.controller';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
    ]),
    AuditModule,
    OutboxModule,
    // Публичный каталог показывает имя застройщика или агентства и умеет
    // фильтровать по нему. Имя читается на запросе, а не денормализуется в
    // проекцию: переименование организации иначе разошлось бы с каталогом до
    // следующей пересборки публикаций.
    OrganizationsModule,
  ],
  controllers: [PublicController, PublicListingsController],
  providers: [MarketplacePublicationRepository, PublicationService],
  exports: [PublicationService, MarketplacePublicationRepository],
})
export class PublicationModule {}
