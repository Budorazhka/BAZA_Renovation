import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { ParseObjectIdPipe } from '../../shared/validation/parse-object-id.pipe';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { ExtendBookingDto } from './dto/extend-booking.dto';
import { ConvertBookingToDealDto } from './dto/convert-booking-to-deal.dto';
import { ListBookingsQueryDto } from './dto/list-bookings.dto';
import { BookingsService, toBookingResponse } from './bookings.service';

@Controller()
@UseGuards(TenantGuard, PermissionGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly policyEvaluator: PolicyEvaluatorService,
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

  /**
   * BOOK-001 follow-up — booking.cancel.organization (не .own, см.
   * BookingsService.cancelBooking докстринг). Тело запроса опционально
   * (только reason) — Idempotency-Key всё равно обязателен, тот же принцип,
   * что publish/cancel/manual-ledger (ADR-006, master plan разд.6.4).
   */
  @Post('bookings/:bookingId/cancel')
  @HttpCode(200)
  @RequirePermission('booking', 'cancel')
  async cancelBooking(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', ParseObjectIdPipe) bookingId: Types.ObjectId,
    @Body() dto: CancelBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const requestBody = { bookingId: bookingId.toString(), reason: dto.reason ?? null };
    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'cancelBooking',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.bookingsService.cancelBooking({
      bookingId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId,
      reason: dto.reason,
      idempotencyKey,
      correlationId: req.correlationId,
    });

    if ('replay' in result) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(200);
    return toBookingResponse(result);
  }

  /**
   * BOOK-001 follow-up — booking.confirm.own (см. BookingsService.
   * confirmBooking докстринг: единственное действие этого триптиха,
   * доступное manager'у, только для СВОЕЙ брони). ownerFilterForAction —
   * тот же паттерн, что LeadController/DealController/TaskController: сам
   * PermissionGuard проверяет только наличие гранта, own-scope сужение до
   * конкретной Position делает repository-фильтр в сервисе.
   */
  @Post('bookings/:bookingId/confirm')
  @HttpCode(200)
  @RequirePermission('booking', 'confirm')
  async confirmBooking(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', ParseObjectIdPipe) bookingId: Types.ObjectId,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const requestBody = { bookingId: bookingId.toString() };
    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'confirmBooking',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.bookingsService.confirmBooking({
      bookingId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId,
      requiredManagerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'confirm'),
      idempotencyKey,
      correlationId: req.correlationId,
    });

    if ('replay' in result) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(200);
    return toBookingResponse(result);
  }

  /**
   * BOOK-001 follow-up — booking.extend.organization (не .own, см.
   * BookingsService.extendBooking докстринг).
   */
  @Post('bookings/:bookingId/extend')
  @HttpCode(200)
  @RequirePermission('booking', 'extend')
  async extendBooking(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', ParseObjectIdPipe) bookingId: Types.ObjectId,
    @Body() dto: ExtendBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const requestBody = { bookingId: bookingId.toString(), newExpiresAt: new Date(dto.newExpiresAt).toISOString() };
    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'extendBooking',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.bookingsService.extendBooking({
      bookingId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId,
      newExpiresAt: new Date(dto.newExpiresAt),
      idempotencyKey,
      correlationId: req.correlationId,
    });

    if ('replay' in result) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(200);
    return toBookingResponse(result);
  }

  /**
   * booking.convert_to_deal — закрытие брони и создание сделки в CRM.
   *
   * ИСПРАВЛЕНО 10.09.2026: гейт был только @RequirePermission('deal',
   * 'create') — совсем другой ресурс, не 'booking'. Manager с
   * booking.confirm.own (own-scope, не organization/global) мог
   * конвертировать в сделку ЧУЖУЮ бронь, хотя confirm/cancel/extend её ему
   * недоступны. ownerFilterForAction('confirm') — тот же own-scope filter,
   * что уже применяется к confirmBooking, переиспользован здесь как
   * ближайшая по семантике проверка "своя ли эта бронь".
   */
  @Post('bookings/:bookingId/convert-to-deal')
  @HttpCode(201)
  @RequirePermission('deal', 'create')
  async convertToDeal(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', ParseObjectIdPipe) bookingId: Types.ObjectId,
    @Body() dto: ConvertBookingToDealDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const requestBody = {
      bookingId: bookingId.toString(),
      title: dto.title ?? null,
      contactId: dto.contactId ?? null,
      dealType: dto.dealType ?? null,
      installmentPlanId: dto.installmentPlanId ?? null,
      downPayment: dto.downPayment ?? null,
      expectedCommission: dto.expectedCommission ?? null,
      notes: dto.notes ?? null,
    };
    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'convertBookingToDeal',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.bookingsService.convertToDeal({
      bookingId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorIdentityId,
      managerPositionId: new Types.ObjectId(tenantContext.positionId),
      requiredManagerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'confirm'),
      title: dto.title,
      contactId: dto.contactId ? new Types.ObjectId(dto.contactId) : undefined,
      dealType: dto.dealType,
      installmentPlanId: dto.installmentPlanId ? new Types.ObjectId(dto.installmentPlanId) : undefined,
      downPayment: dto.downPayment,
      expectedCommission: dto.expectedCommission,
      notes: dto.notes,
      idempotencyKey,
      correlationId: req.correlationId,
    });

    if ('replay' in result) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(201);
    return {
      booking: toBookingResponse(result.booking),
      dealId: result.deal._id.toString(),
    };
  }

  /**
   * BOOK-002: GET /bookings — единственный не-idempotency-gated эндпоинт
   * этого контроллера (read, не мутирует ничего, Idempotency-Key ему не
   * нужен). developmentId/buildingId/unitId — опциональные, взаимно
   * приоритетные фильтры (см. BookingsService.listBookings докстринг).
   * managerPositionId — own-scope сужение через тот же
   * ownerFilterForAction, что confirmBooking (undefined при organization/
   * global scope гранта `booking.read`).
   */
  @Get('bookings')
  @RequirePermission('booking', 'read')
  async listBookings(@Req() req: FastifyRequest, @Query() dto: ListBookingsQueryDto) {
    const tenantContext = requireTenantContext(req);

    const items = await this.bookingsService.listBookings({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      developmentId: dto.developmentId ? new Types.ObjectId(dto.developmentId) : undefined,
      buildingId: dto.buildingId ? new Types.ObjectId(dto.buildingId) : undefined,
      unitId: dto.unitId ? new Types.ObjectId(dto.unitId) : undefined,
      status: dto.status,
      managerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });

    const nextCursor = items.length === dto.limit ? items[items.length - 1]!._id.toString() : null;
    return { items: items.map(toBookingResponse), nextCursor };
  }

  /**
   * Сужает non-organization/non-global scope до конкретной Position — тот
   * же паттерн, что LeadController.ownerFilterForAction. PermissionGuard
   * уже подтвердил, что grant с данным action существует; этот метод решает
   * ТОЛЬКО "весь tenant или только своя позиция", не allow/deny.
   */
  private async ownerFilterForAction(positionId: string, action: string): Promise<Types.ObjectId | undefined> {
    const positionObjectId = new Types.ObjectId(positionId);
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionObjectId,
      resource: 'booking',
      action,
    });
    return scopes.some((scope) => scope === 'organization' || scope === 'global') ? undefined : positionObjectId;
  }
}
