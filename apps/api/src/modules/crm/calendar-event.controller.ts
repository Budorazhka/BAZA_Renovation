import {
  Body,
  Headers,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { ParseObjectIdPipe } from '../../shared/validation/parse-object-id.pipe';
import { CrmService } from './crm.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { MoveCalendarEventDto } from './dto/move-calendar-event.dto';
import { ListCalendarEventsDto, ListCalendarUnifiedDto } from './dto/list-calendar-events.dto';

/**
 * ERP tenant-scoped Calendar endpoints — расширение существующего CRM-модуля
 * (событие календаря концептуально относится к той же tenant/CRM-области,
 * что Lead/Deal/Task), не отдельный `calendar`-модуль.
 *
 * Осознанно урезанный scope (см. задание, CalendarEventDocument докстринг):
 * повторяющиеся события (`isRecurring`/`recurringRule`/`parentEventId`) и
 * напоминания (`reminderMinutes`) ХРАНЯТСЯ, но НЕ ИНТЕРПРЕТИРУЮТСЯ — сервер
 * не разворачивает серию будущих вхождений и не планирует email/push.
 *
 * `GET /calendar/events/view` (легаси) не реализован — фронтенд (см.
 * CrmSyncContext.tsx) использует только `getCalendarUnified`, не
 * `getCalendarEventsView`.
 */
@Controller('calendar')
@UseGuards(TenantGuard, PermissionGuard)
export class CalendarEventController {
  constructor(
    private readonly crmService: CrmService,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get('events')
  @RequirePermission('calendar_event', 'read')
  async listEvents(@Req() req: FastifyRequest, @Query() dto: ListCalendarEventsDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.listCalendarEvents({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      type: dto.type,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      dealId: dto.dealId ? new Types.ObjectId(dto.dealId) : undefined,
      scopePositionId: await this.scopeFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Get('unified')
  @RequirePermission('calendar_event', 'read')
  async getUnified(@Req() req: FastifyRequest, @Query() dto: ListCalendarUnifiedDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getUnifiedCalendar({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      scopePositionId: await this.scopeFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Get('events/:eventId')
  @RequirePermission('calendar_event', 'read')
  async getEvent(
    @Req() req: FastifyRequest,
    @Param('eventId', ParseObjectIdPipe) eventId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getCalendarEvent({
      eventId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      scopePositionId: await this.scopeFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Post('events')
  @HttpCode(201)
  @RequirePermission('calendar_event', 'create')
  async createEvent(
    @Req() req: FastifyRequest,
    @Body() dto: CreateCalendarEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantContext = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);
    const idempotencyRequestBody = {
      title: dto.title,
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type ?? null,
      leadId: dto.leadId ?? null,
      dealId: dto.dealId ?? null,
    };

    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'createCalendarEvent',
      key: idempotencyKey,
      requestBody: idempotencyRequestBody,
    });
    if (replay) {
      return replay.responseBody;
    }

    return this.crmService.createCalendarEvent({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId,
      idempotencyKey,
      idempotencyRequestBody,
      title: dto.title,
      description: dto.description,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      type: dto.type,
      isAllDay: dto.isAllDay,
      location: dto.location,
      meetingUrl: dto.meetingUrl,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      dealId: dto.dealId ? new Types.ObjectId(dto.dealId) : undefined,
      participants: dto.participants?.map((id) => new Types.ObjectId(id)),
      externalParticipants: dto.externalParticipants,
      reminderMinutes: dto.reminderMinutes,
      isRecurring: dto.isRecurring,
      recurringRule: dto.recurringRule,
      parentEventId: dto.parentEventId ? new Types.ObjectId(dto.parentEventId) : undefined,
      correlationId: req.correlationId,
    });
  }

  @Patch('events/:eventId')
  @HttpCode(200)
  @RequirePermission('calendar_event', 'update')
  async updateEvent(
    @Req() req: FastifyRequest,
    @Param('eventId', ParseObjectIdPipe) eventId: Types.ObjectId,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.updateCalendarEvent({
      eventId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      scopePositionId: await this.scopeFilterForAction(tenantContext.positionId, 'update'),
      expectedVersion: dto.expectedVersion,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      status: dto.status,
      isAllDay: dto.isAllDay,
      location: dto.location,
      meetingUrl: dto.meetingUrl,
      leadId: dto.leadId === null ? null : dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      dealId: dto.dealId === null ? null : dto.dealId ? new Types.ObjectId(dto.dealId) : undefined,
      participants: dto.participants?.map((id) => new Types.ObjectId(id)),
      externalParticipants: dto.externalParticipants,
      reminderMinutes: dto.reminderMinutes,
      isRecurring: dto.isRecurring,
      recurringRule: dto.recurringRule,
      parentEventId:
        dto.parentEventId === null ? null : dto.parentEventId ? new Types.ObjectId(dto.parentEventId) : undefined,
      correlationId: req.correlationId,
    });
  }

  /**
   * PATCH /calendar/events/:eventId/move — легаси отдельно выделяет
   * "перетащить в календаре" от общего PATCH (см. CalendarEventController
   * докстринг / задание). Тот же грант calendar_event.update, что общий
   * PATCH — перенос по датам не разрушительнее правки остальных полей.
   */
  @Patch('events/:eventId/move')
  @HttpCode(200)
  @RequirePermission('calendar_event', 'update')
  async moveEvent(
    @Req() req: FastifyRequest,
    @Param('eventId', ParseObjectIdPipe) eventId: Types.ObjectId,
    @Body() dto: MoveCalendarEventDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.moveCalendarEvent({
      eventId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      scopePositionId: await this.scopeFilterForAction(tenantContext.positionId, 'update'),
      expectedVersion: dto.expectedVersion,
      newStartTime: new Date(dto.newStartTime),
      newEndTime: new Date(dto.newEndTime),
      correlationId: req.correlationId,
    });
  }

  @Delete('events/:eventId')
  @HttpCode(200)
  @RequirePermission('calendar_event', 'delete')
  async deleteEvent(
    @Req() req: FastifyRequest,
    @Param('eventId', ParseObjectIdPipe) eventId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.deleteCalendarEvent({
      eventId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      scopePositionId: await this.scopeFilterForAction(tenantContext.positionId, 'delete'),
      correlationId: req.correlationId,
    });
  }

  private async scopeFilterForAction(positionId: string, action: string): Promise<Types.ObjectId | undefined> {
    const positionObjectId = new Types.ObjectId(positionId);
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionObjectId,
      resource: 'calendar_event',
      action,
    });
    return scopes.some((scope) => scope === 'organization' || scope === 'global')
      ? undefined
      : positionObjectId;
  }
}
