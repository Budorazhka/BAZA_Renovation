import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { ParseObjectIdPipe } from '../../shared/validation/parse-object-id.pipe';
import { CrmService } from './crm.service';
import { ListContactsDto } from './dto/list-contacts.dto';
import { ListTimelineDto } from './dto/list-timeline.dto';

/**
 * ERP tenant-scoped contact-read endpoints — тот же принцип разделения, что
 * LeadController (физически отдельный controller от CrmController, у
 * которого публичный reveal-contact без guard'ов).
 */
@Controller('contacts')
@UseGuards(TenantGuard, PermissionGuard)
export class ContactController {
  constructor(
    private readonly crmService: CrmService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  @Get()
  @RequirePermission('contact', 'read')
  async listContacts(@Req() req: FastifyRequest, @Query() dto: ListContactsDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.listContacts({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      ownerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      q: dto.q,
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });
  }

  @Get(':contactId')
  @RequirePermission('contact', 'read')
  async getContact(
    @Req() req: FastifyRequest,
    @Param('contactId', ParseObjectIdPipe) contactId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getContact({
      contactId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      ownerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Get(':contactId/timeline')
  @RequirePermission('contact', 'read')
  async getContactTimeline(
    @Req() req: FastifyRequest,
    @Param('contactId', ParseObjectIdPipe) contactId: Types.ObjectId,
    @Query() dto: ListTimelineDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getContactTimeline({
      contactId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      ownerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      type: dto.type,
      from: dto.from,
      to: dto.to,
      cursor: dto.cursor,
      limit: dto.limit,
    });
  }

  /**
   * Тот же паттерн, что LeadController.ownerFilterForAction — сужает
   * non-organization/non-global scope до текущей Position.
   * CrmService.listContacts/getContact резолвят это в множество "своих"
   * contactId ТРАНЗИТИВНО через Lead (см. их докстринги) — Contact сам по
   * себе не хранит ownerPositionId.
   */
  private async ownerFilterForAction(positionId: string, action: string): Promise<Types.ObjectId | undefined> {
    const positionObjectId = new Types.ObjectId(positionId);
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionObjectId,
      resource: 'contact',
      action,
    });
    return scopes.some((scope) => scope === 'organization' || scope === 'global')
      ? undefined
      : positionObjectId;
  }
}
