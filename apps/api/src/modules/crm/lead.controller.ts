import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { CrmService } from './crm.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ChangeLeadStageDto } from './dto/change-lead-stage.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { ListLeadEventsDto } from './dto/list-lead-events.dto';
import { ListTimelineDto } from './dto/list-timeline.dto';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { ParseObjectIdPipe } from '../../shared/validation/parse-object-id.pipe';

/**
 * ERP tenant-scoped lead-management endpoints — физически отдельный
 * controller от CrmController (публичный reveal-contact, без guard'ов),
 * тот же принцип разделения, что PublicController/AdminPublicationController.
 */
@Controller('leads')
@UseGuards(TenantGuard, PermissionGuard)
export class LeadController {
  constructor(
    private readonly crmService: CrmService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  /**
   * lead.create.organization — CrmService.createLead докстринг: ровно один
   * из contactId/requesterPhone, лид создаётся unassigned (не auto-
   * assign на actor'а — assignLead отдельная explicit команда). Idempotency-
   * Key НЕ требуется (тот же паттерн, что createDeal — не входит в ADR-006
   * "publish/book/cancel/manual-ledger" список critical commands).
   */
  @Post()
  @HttpCode(201)
  @RequirePermission('lead', 'create')
  async createLead(@Req() req: FastifyRequest, @Body() dto: CreateLeadDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.createLead({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      contactId: dto.contactId ? new Types.ObjectId(dto.contactId) : undefined,
      requesterName: dto.requesterName,
      requesterPhone: dto.requesterPhone,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });
  }

  @Get()
  @RequirePermission('lead', 'read')
  async listLeads(@Req() req: FastifyRequest, @Query() dto: ListLeadsDto) {
    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);
    const ownerPositionId = this.resolveOwnerFilter(
      await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      dto.ownerPositionId,
    );
    return this.crmService.listLeads({
      organizationId,
      ownerPositionId,
      stage: dto.stage,
      stalled: dto.stalled,
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });
  }

  @Get(':leadId')
  @RequirePermission('lead', 'read')
  async getLead(@Req() req: FastifyRequest, @Param('leadId', ParseObjectIdPipe) leadId: Types.ObjectId) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getLead({
      leadId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      ownerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Get(':leadId/events')
  @RequirePermission('lead', 'read')
  async listLeadEvents(
    @Req() req: FastifyRequest,
    @Param('leadId', ParseObjectIdPipe) leadId: Types.ObjectId,
    @Query() dto: ListLeadEventsDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.listLeadEvents({
      leadId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      ownerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });
  }

  @Get(':leadId/timeline')
  @RequirePermission('lead', 'read')
  async getLeadTimeline(
    @Req() req: FastifyRequest,
    @Param('leadId', ParseObjectIdPipe) leadId: Types.ObjectId,
    @Query() dto: ListTimelineDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getLeadTimeline({
      leadId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      ownerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      type: dto.type,
      from: dto.from,
      to: dto.to,
      cursor: dto.cursor,
      limit: dto.limit,
    });
  }

  @Post(':leadId/assign')
  @HttpCode(200)
  @RequirePermission('lead', 'assign')
  async assignLead(
    @Req() req: FastifyRequest,
    @Param('leadId', ParseObjectIdPipe) leadId: Types.ObjectId,
    @Body() dto: AssignLeadDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.assignLead({
      leadId,
      assigneePositionId: new Types.ObjectId(dto.assigneePositionId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
      correlationId: req.correlationId,
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке — см. CrmService.changeLeadStage комментарий.
   * D-05B: отдельный grant `lead.changeStage` (не переиспользует
   * `lead.assign`) — подтверждено владельцем: manager должен мочь менять
   * стадию СВОИХ лидов (scope 'own' в DEFAULT_ROLE_GRANTS), в отличие от
   * assign (только owner/director/rop, organization-wide). PermissionGuard
   * проверяет только НАЛИЧИЕ гранта, не сужает по scope (см.
   * PolicyEvaluatorService.scopeCovers) — own-scope сужение до конкретного
   * лида делает ownerFilterForAction ниже, тот же паттерн, что уже
   * применяется для read.
   */
  @Patch(':leadId/stage')
  @HttpCode(200)
  @RequirePermission('lead', 'changeStage')
  async changeStage(
    @Req() req: FastifyRequest,
    @Param('leadId', ParseObjectIdPipe) leadId: Types.ObjectId,
    @Body() dto: ChangeLeadStageDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.changeLeadStage({
      leadId,
      newStage: dto.stage,
      expectedVersion: dto.expectedVersion,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
      requiredOwnerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'changeStage'),
      correlationId: req.correlationId,
    });
  }

  /**
   * GET /leads фильтр ownerPositionId — клиентское значение ДОПОЛНИТЕЛЬНО
   * сужает, никогда не расширяет уже резолвленный permission scope
   * (тот же AND-принцип, что AdminAuditService.buildClientFilter):
   *  - scopeFilter===undefined (organization/global grant) → любой клиентский
   *    ownerPositionId проходит как есть, включая undefined (весь tenant).
   *  - scopeFilter задан (own/assigned grant, уже = своя Position) → клиент
   *    может явно запросить ТОЛЬКО ту же самую Position (идемпотентно) или
   *    не передавать фильтр вовсе; запрос чужой Position здесь — попытка
   *    расширить own-scope, отклоняется 400 (не 403 — сам grant на read
   *    есть, это невалидная комбинация фильтров, тот же класс ошибки, что
   *    невалидный cursor/limit, не authorization-отказ).
   */
  private resolveOwnerFilter(
    scopeFilter: Types.ObjectId | undefined,
    clientOwnerPositionId: string | undefined,
  ): Types.ObjectId | undefined {
    if (!clientOwnerPositionId) {
      return scopeFilter;
    }
    const requested = new Types.ObjectId(clientOwnerPositionId);
    if (scopeFilter && !scopeFilter.equals(requested)) {
      throw new BadRequestException('ownerPositionId filter is outside the caller permission scope');
    }
    return requested;
  }

  /**
   * Сужает non-organization/non-global scope до конкретной Position —
   * переиспользуется и для read (GET /leads, GET /leads/:id), и для write
   * (PATCH /leads/:id/stage). PermissionGuard уже подтвердил, что grant с
   * данным action существует (иначе запрос не дошёл бы сюда) — этот метод
   * решает ТОЛЬКО "весь tenant или только своя позиция", не allow/deny.
   */
  private async ownerFilterForAction(positionId: string, action: string): Promise<Types.ObjectId | undefined> {
    const positionObjectId = new Types.ObjectId(positionId);
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionObjectId,
      resource: 'lead',
      action,
    });
    // organization/global — весь tenant. Для own/assigned/position и
    // неизвестного будущего scope выбираем безопасное сужение до своей
    // позиции; расширение до team возможно только вместе с моделью
    // подчинённости и отдельным тестом, не "по умолчанию".
    return scopes.some((scope) => scope === 'organization' || scope === 'global')
      ? undefined
      : positionObjectId;
  }
}
