import { Body, Controller, Headers, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingsService, toBookingResponse } from './bookings.service';

@Controller()
@UseGuards(TenantGuard, PermissionGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('bookings')
  @HttpCode(201)
  @RequirePermission('booking', 'create')
  async createBooking(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const requestBody = {
      unitId: dto.unitId,
      leadId: dto.leadId ?? null,
      startsAt: new Date(dto.startsAt).toISOString(),
      expiresAt: new Date(dto.expiresAt).toISOString(),
    };
    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'createBooking',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.bookingsService.book({
      unitId: new Types.ObjectId(dto.unitId),
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      managerPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId,
      startsAt: new Date(dto.startsAt),
      expiresAt: new Date(dto.expiresAt),
      idempotencyKey,
      correlationId: req.correlationId,
    });

    if ('replay' in result) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(201);
    return toBookingResponse(result);
  }
}
