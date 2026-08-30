import {
  BadRequestException,
  Body,
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
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { ChangeDealStageDto } from './dto/change-deal-stage.dto';
import { AddDealParticipantDto } from './dto/add-deal-participant.dto';
import { UpdateDealChecklistDto } from './dto/update-deal-checklist.dto';
import { ListDealsDto } from './dto/list-deals.dto';

/**
 * ERP tenant-scoped Deal endpoints (DEAL-001).
 * Enforces tenant isolation, RBAC permissions, and own-scope non-disclosure.
 */
@Controller('deals')
@UseGuards(TenantGuard, PermissionGuard)
export class DealController {
  constructor(
    private readonly crmService: CrmService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  @Get()
  @RequirePermission('deal', 'read')
  async listDeals(@Req() req: FastifyRequest, @Query() dto: ListDealsDto) {
    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);
    const ownerPositionId = this.resolveOwnerFilter(
      await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      dto.ownerPositionId,
    );

    return this.crmService.listDeals({
      organizationId,
      ownerPositionId,
      stage: dto.stage,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      contactId: dto.contactId ? new Types.ObjectId(dto.contactId) : undefined,
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });
  }

  @Get(':dealId')
  @RequirePermission('deal', 'read')
  async getDeal(
    @Req() req: FastifyRequest,
    @Param('dealId', ParseObjectIdPipe) dealId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getDeal({
      dealId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      requiredOwnerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('deal', 'create')
  async createDeal(@Req() req: FastifyRequest, @Body() dto: CreateDealDto) {
    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);
    const actorPositionId = new Types.ObjectId(tenantContext.positionId);
    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);

    const ownerScopePositionId = await this.ownerFilterForAction(tenantContext.positionId, 'create');
    let ownerPositionId = actorPositionId;
    if (dto.ownerPositionId) {
      const requestedOwner = new Types.ObjectId(dto.ownerPositionId);
      if (ownerScopePositionId && !ownerScopePositionId.equals(requestedOwner)) {
        throw new BadRequestException('ownerPositionId is outside caller permission scope');
      }
      ownerPositionId = requestedOwner;
    }

    return this.crmService.createDeal({
      organizationId,
      contactId: new Types.ObjectId(dto.contactId),
      ownerPositionId,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      title: dto.title,
      description: dto.description,
      stage: dto.stage,
      expectedCommission: dto.expectedCommission,
      participants: dto.participants?.map((p) => ({
        role: p.role,
        contactId: new Types.ObjectId(p.contactId),
      })),
      checklistItems: dto.checklistItems?.map((item) => ({
        id: item.id,
        label: item.label,
        done: item.done,
      })),
      actorPositionId,
      actorIdentityId,
      correlationId: req.correlationId,
    });
  }

  @Patch(':dealId')
  @HttpCode(200)
  @RequirePermission('deal', 'edit')
  async updateDeal(
    @Req() req: FastifyRequest,
    @Param('dealId', ParseObjectIdPipe) dealId: Types.ObjectId,
    @Body() dto: UpdateDealDto,
  ) {
    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);
    const actorPositionId = new Types.ObjectId(tenantContext.positionId);
    const actorIdentityId = new Types.ObjectId(tenantContext.identityId);

    const ownerScopePositionId = await this.ownerFilterForAction(tenantContext.positionId, 'edit');
    if (dto.ownerPositionId && ownerScopePositionId && !ownerScopePositionId.equals(new Types.ObjectId(dto.ownerPositionId))) {
      throw new BadRequestException('ownerPositionId is outside caller permission scope');
    }

    return this.crmService.updateDeal({
      dealId,
      organizationId,
      requiredOwnerPositionId: ownerScopePositionId,
      title: dto.title,
      description: dto.description,
      ownerPositionId: dto.ownerPositionId ? new Types.ObjectId(dto.ownerPositionId) : undefined,
      expectedCommission: dto.expectedCommission,
      actorPositionId,
      actorIdentityId,
      correlationId: req.correlationId,
    });
  }

  @Patch(':dealId/stage')
  @HttpCode(200)
  @RequirePermission('deal', 'changeStage')
  async changeDealStage(
    @Req() req: FastifyRequest,
    @Param('dealId', ParseObjectIdPipe) dealId: Types.ObjectId,
    @Body() dto: ChangeDealStageDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.changeDealStage({
      dealId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      requiredOwnerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'changeStage'),
      newStage: dto.stage,
      expectedVersion: dto.expectedVersion,
      reason: dto.reason,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });
  }

  @Post(':dealId/participants')
  @HttpCode(200)
  @RequirePermission('deal', 'edit')
  async addDealParticipant(
    @Req() req: FastifyRequest,
    @Param('dealId', ParseObjectIdPipe) dealId: Types.ObjectId,
    @Body() dto: AddDealParticipantDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.addDealParticipant({
      dealId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      requiredOwnerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'edit'),
      contactId: new Types.ObjectId(dto.contactId),
      role: dto.role,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });
  }

  @Delete(':dealId/participants/:contactId')
  @HttpCode(200)
  @RequirePermission('deal', 'edit')
  async removeDealParticipant(
    @Req() req: FastifyRequest,
    @Param('dealId', ParseObjectIdPipe) dealId: Types.ObjectId,
    @Param('contactId', ParseObjectIdPipe) contactId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.removeDealParticipant({
      dealId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      requiredOwnerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'edit'),
      contactId,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });
  }

  @Patch(':dealId/checklist')
  @HttpCode(200)
  @RequirePermission('deal', 'edit')
  async updateDealChecklist(
    @Req() req: FastifyRequest,
    @Param('dealId', ParseObjectIdPipe) dealId: Types.ObjectId,
    @Body() dto: UpdateDealChecklistDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.updateDealChecklist({
      dealId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      requiredOwnerPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'edit'),
      items: dto.items,
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });
  }

  private resolveOwnerFilter(
    scopeFilter: Types.ObjectId | undefined,
    clientOwnerPositionId: string | undefined,
  ): Types.ObjectId | undefined {
    if (!clientOwnerPositionId) {
      return scopeFilter;
    }
    const requested = new Types.ObjectId(clientOwnerPositionId);
    if (scopeFilter && !scopeFilter.equals(requested)) {
      throw new BadRequestException('ownerPositionId filter is outside caller permission scope');
    }
    return requested;
  }

  private async ownerFilterForAction(positionId: string, action: string): Promise<Types.ObjectId | undefined> {
    const positionObjectId = new Types.ObjectId(positionId);
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionObjectId,
      resource: 'deal',
      action,
    });
    return scopes.some((scope) => scope === 'organization' || scope === 'global')
      ? undefined
      : positionObjectId;
  }
}
