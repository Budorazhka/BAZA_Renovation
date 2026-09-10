import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { AdminPolicyService } from './admin-policy.service';
import { BillingService } from '../billing/billing.service';
import { ActivateSubscriptionRequestDto } from '../billing/dto/activate-subscription-request.dto';

@Controller('admin/organizations/:organizationId/billing')
@UseGuards(AdminGuard)
export class AdminBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly adminPolicyService: AdminPolicyService,
  ) {}

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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const adminContext = requireAdminContext(req);
    // ИСПРАВЛЕНО 10.09.2026: раньше единственной проверкой был AdminGuard
    // (наличие валидного AdminContext) — ЛЮБОЙ админ, даже с одним мелким
    // городским грантом, мог выдать любой организации платный тариф на
    // 0 денег. permission-matrix.md:149 "Manual ledger change — Admin grant
    // manual_ledger.write.*".
    await this.adminPolicyService.requireGrant({
      adminContext,
      resource: 'manual_ledger',
      action: 'write',
    });

    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const identityId = new Types.ObjectId(adminContext.identityId);
    const requestBody = { organizationId: organizationIdParam, ...dto };
    const replay = await this.billingService.checkActivateReplay(identityId, idempotencyKey, requestBody);
    if (replay) {
      return replay.responseBody;
    }

    return this.billingService.adminActivateSubscription(adminContext, {
      organizationId: new Types.ObjectId(organizationIdParam),
      planCode: dto.planCode,
      periodDays: dto.periodDays,
      amountMinorUnits: dto.amountMinorUnits,
      currency: dto.currency,
      reason: dto.reason,
      correlationId: req.correlationId,
      idempotency: { identityId, key: idempotencyKey, requestBody },
    });
  }
}
