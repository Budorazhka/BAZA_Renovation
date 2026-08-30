import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MarketplacePublicationDocument,
  MarketplacePublicationSchema,
  MarketplacePublicationRepository,
} from '@baza/publication';
import { DevelopmentDocument, DevelopmentSchema, DevelopmentRepository } from '@baza/development';
import {
  PropertyAssetDocument,
  PropertyAssetSchema,
  PropertyAssetRepository,
  ListingDocument,
  ListingSchema,
  ListingRepository,
} from '@baza/property-assets';
import { ContactDocument, ContactSchema } from './schemas/contact.schema';
import { LeadDocument, LeadSchema } from './schemas/lead.schema';
import { LeadEventDocument, LeadEventSchema } from './schemas/lead-event.schema';
import { TaskDocument, TaskSchema } from './schemas/task.schema';
import { DealDocument, DealSchema } from './schemas/deal.schema';
import { DealEventDocument, DealEventSchema } from './schemas/deal-event.schema';
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import { TaskRepository } from './repository/task.repository';
import { DealRepository } from './repository/deal.repository';
import { DealEventRepository } from './repository/deal-event.repository';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { ListingCrmController } from './listing-crm.controller';
import { LeadController } from './lead.controller';
import { ContactController } from './contact.controller';
import { TaskController } from './task.controller';
import { DealController } from './deal.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PublicRevealIdempotencyModule } from '../../shared/idempotency/public-reveal-idempotency.module';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactDocument.name, schema: ContactSchema },
      { name: LeadDocument.name, schema: LeadSchema },
      { name: LeadEventDocument.name, schema: LeadEventSchema },
      { name: TaskDocument.name, schema: TaskSchema },
      { name: DealDocument.name, schema: DealSchema },
      { name: DealEventDocument.name, schema: DealEventSchema },
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
      { name: DevelopmentDocument.name, schema: DevelopmentSchema },
      { name: PropertyAssetDocument.name, schema: PropertyAssetSchema },
      { name: ListingDocument.name, schema: ListingSchema },
    ]),
    AuditModule,
    AuthorizationModule,
    OrganizationsModule,
    PublicRevealIdempotencyModule,
    RateLimitModule,
    OutboxModule,
  ],
  controllers: [
    CrmController,
    ListingCrmController,
    LeadController,
    ContactController,
    TaskController,
    DealController,
  ],
  providers: [
    ContactRepository,
    LeadRepository,
    LeadEventRepository,
    TaskRepository,
    DealRepository,
    DealEventRepository,
    MarketplacePublicationRepository,
    DevelopmentRepository,
    PropertyAssetRepository,
    ListingRepository,
    CrmService,
  ],
  exports: [TaskRepository, DealRepository],
})
export class CrmModule {}
