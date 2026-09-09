import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { BillingService } from './billing.service';
import type { TargetAudience } from './schemas/subscription-plan.schema';

@Controller('billing')
@UseGuards(TenantGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('subscription')
  async getSubscription(@Req() req: FastifyRequest) {
    const tenantContext = requireTenantContext(req);
    return this.billingService.getOrganizationSubscription(
      new Types.ObjectId(tenantContext.organizationId),
    );
  }

  @Get('plans')
  async listPlans(@Query('audience') audience?: TargetAudience) {
    return this.billingService.listPlans(audience);
  }

  @Get('ledger')
  @UseGuards(PermissionGuard)
  @RequirePermission('manual_ledger', 'read')
  async getLedger(@Req() req: FastifyRequest) {
    const tenantContext = requireTenantContext(req);
    return this.billingService.getLedgerForOwner(tenantContext);
  }
}
