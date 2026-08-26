import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MarketplacePublicationDocument,
  MarketplacePublicationSchema,
  MarketplacePublicationRepository,
} from '@baza/publication';
import { PublicationService } from './publication.service';
import { PublicController } from './public.controller';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
    ]),
    AuditModule,
    OutboxModule,
  ],
  controllers: [PublicController],
  providers: [MarketplacePublicationRepository, PublicationService],
  exports: [PublicationService, MarketplacePublicationRepository],
})
export class PublicationModule {}
