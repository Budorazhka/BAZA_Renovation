import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionPlanDocument, SubscriptionPlanSchema } from './schemas/subscription-plan.schema';
import { OrganizationSubscriptionDocument, OrganizationSubscriptionSchema } from './schemas/organization-subscription.schema';
import { BillingLedgerEntryDocument, BillingLedgerEntrySchema } from './schemas/billing-ledger-entry.schema';
import { SubscriptionPlanRepository } from './repository/subscription-plan.repository';
import { OrganizationSubscriptionRepository } from './repository/organization-subscription.repository';
import { BillingLedgerRepository } from './repository/billing-ledger.repository';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubscriptionPlanDocument.name, schema: SubscriptionPlanSchema },
      { name: OrganizationSubscriptionDocument.name, schema: OrganizationSubscriptionSchema },
      { name: BillingLedgerEntryDocument.name, schema: BillingLedgerEntrySchema },
    ]),
    AuthorizationModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [BillingController],
  providers: [
    SubscriptionPlanRepository,
    OrganizationSubscriptionRepository,
    BillingLedgerRepository,
    BillingService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
