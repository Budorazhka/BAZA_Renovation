import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MarketplacePublicationDocument,
  MarketplacePublicationSchema,
  MarketplacePublicationRepository,
} from '@baza/publication';
import { DevelopmentDocument, DevelopmentSchema, DevelopmentRepository } from '@baza/development';
import { ContactDocument, ContactSchema } from './schemas/contact.schema';
import { LeadDocument, LeadSchema } from './schemas/lead.schema';
import { LeadEventDocument, LeadEventSchema } from './schemas/lead-event.schema';
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { LeadController } from './lead.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactDocument.name, schema: ContactSchema },
      { name: LeadDocument.name, schema: LeadSchema },
      { name: LeadEventDocument.name, schema: LeadEventSchema },
      // @baza/publication и @baza/development Mongoose-модели уже
      // зарегистрированы в других модулях (PublicationModule/
      // DevelopmentsModule), но NestJS MongooseModule.forFeature требует
      // явной регистрации в КАЖДОМ модуле, использующем @InjectModel для
      // этого имени — иначе Nest не сможет разрешить DI-зависимость
      // MarketplacePublicationRepository/DevelopmentRepository здесь.
      { name: MarketplacePublicationDocument.name, schema: MarketplacePublicationSchema },
      { name: DevelopmentDocument.name, schema: DevelopmentSchema },
    ]),
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [CrmController, LeadController],
  providers: [
    ContactRepository,
    LeadRepository,
    LeadEventRepository,
    MarketplacePublicationRepository,
    DevelopmentRepository,
    CrmService,
  ],
})
export class CrmModule {}
