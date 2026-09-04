import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DevSelectionDocument, DevSelectionSchema } from './schemas/dev-selection.schema';
import { DevSelectionRepository } from './repository/dev-selection.repository';
import { SelectionsService } from './selections.service';
import { SelectionsController } from './selections.controller';
import { PublicSelectionsController } from './public-selections.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';
import { DevelopmentsModule } from '../developments/developments.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DevSelectionDocument.name, schema: DevSelectionSchema }]),
    AuthorizationModule,
    IdempotencyModule,
    // Unit-существование (getUnitForOrganization) и Lead-существование
    // (getLeadForOrganization) — только через сервисы этих модулей
    // (ADR-001, apps/api/test/architecture/module-boundaries.test.ts).
    DevelopmentsModule,
    CrmModule,
  ],
  controllers: [SelectionsController, PublicSelectionsController],
  providers: [DevSelectionRepository, SelectionsService],
})
export class SelectionsModule {}
