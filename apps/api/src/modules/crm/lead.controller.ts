import { Body, Controller, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { CrmService } from './crm.service';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ChangeLeadStageDto } from './dto/change-lead-stage.dto';

/**
 * ERP tenant-scoped lead-management endpoints — физически отдельный
 * controller от CrmController (публичный reveal-contact, без guard'ов),
 * тот же принцип разделения, что PublicController/AdminPublicationController.
 */
@Controller('leads')
@UseGuards(TenantGuard, PermissionGuard)
export class LeadController {
  constructor(private readonly crmService: CrmService) {}

  @Post(':leadId/assign')
  @HttpCode(200)
  @RequirePermission('lead', 'assign')
  async assignLead(@Req() req: FastifyRequest, @Param('leadId') leadIdParam: string, @Body() dto: AssignLeadDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.assignLead({
      leadId: new Types.ObjectId(leadIdParam),
      assigneePositionId: new Types.ObjectId(dto.assigneePositionId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
      correlationId: req.correlationId,
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке — см. CrmService.changeLeadStage комментарий.
   * permission-matrix.md не специфицирует отдельный grant для смены стадии
   * лида explicit строкой — переиспользует `lead.assign.organization`
   * (тот же круг ролей: РОП/Директор/Собственник управляют лид-воронкой),
   * не заводит новый resource.action без явной спецификации в матрице.
   */
  @Patch(':leadId/stage')
  @HttpCode(200)
  @RequirePermission('lead', 'assign')
  async changeStage(
    @Req() req: FastifyRequest,
    @Param('leadId') leadIdParam: string,
    @Body() dto: ChangeLeadStageDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.changeLeadStage({
      leadId: new Types.ObjectId(leadIdParam),
      newStage: dto.stage,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      expectedOrganizationId: new Types.ObjectId(tenantContext.organizationId),
      correlationId: req.correlationId,
    });
  }
}
