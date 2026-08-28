import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { CrmService } from './crm.service';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ChangeLeadStageDto } from './dto/change-lead-stage.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
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

  @Get()
  @RequirePermission('lead', 'read')
  async listLeads(@Req() req: FastifyRequest, @Query() dto: ListLeadsDto) {
    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);
    const ownerPositionId = await this.ownerFilterForAction(tenantContext.positionId, 'read');
    return this.crmService.listLeads({ organizationId, ownerPositionId, stage: dto.stage, limit: dto.limit });
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
