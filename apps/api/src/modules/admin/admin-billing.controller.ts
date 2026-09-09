import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { BillingService } from '../billing/billing.service';
import { ActivateSubscriptionRequestDto } from '../billing/dto/activate-subscription-request.dto';

@Controller('admin/organizations/:organizationId/billing')
@UseGuards(AdminGuard)
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  async getOverview(
    @Req() req: FastifyRequest,
    @Param('organizationId') organizationIdParam: string,
  ) {
    const adminContext = requireAdminContext(req);
    return this.billingService.adminGetBillingOverview(
      adminContext,
      new Types.ObjectId(organizationIdParam),
    );
  }

  @Post('activate')
  @HttpCode(200)
  async activateSubscription(
    @Req() req: FastifyRequest,
    @Param('organizationId') organizationIdParam: string,
    @Body() dto: ActivateSubscriptionRequestDto,
  ) {
    const adminContext = requireAdminContext(req);
    return this.billingService.adminActivateSubscription(adminContext, {
      organizationId: new Types.ObjectId(organizationIdParam),
      planCode: dto.planCode,
      periodDays: dto.periodDays,
      amountMinorUnits: dto.amountMinorUnits,
      currency: dto.currency,
      reason: dto.reason,
      correlationId: req.correlationId,
    });
  }
}
