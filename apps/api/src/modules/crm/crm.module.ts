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
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { ListingCrmController } from './listing-crm.controller';
import { LeadController } from './lead.controller';
import { ContactController } from './contact.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PublicRevealIdempotencyModule } from '../../shared/idempotency/public-reveal-idempotency.module';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactDocument.name, schema: ContactSchema },
      { name: LeadDocument.name, schema: LeadSchema },
      { name: LeadEventDocument.name, schema: LeadEventSchema },
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
  ],
  controllers: [CrmController, ListingCrmController, LeadController, ContactController],
  providers: [
    ContactRepository,
    LeadRepository,
    LeadEventRepository,
    MarketplacePublicationRepository,
    DevelopmentRepository,
    PropertyAssetRepository,
    ListingRepository,
    CrmService,
  ],
})
export class CrmModule {}
