import {
  BadRequestException,
  Body,
  Controller,
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
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';

/**
 * ERP tenant-scoped Task endpoints.
 * All operations enforce tenant isolation and RBAC permission scoping (own vs organization).
 */
@Controller('tasks')
@UseGuards(TenantGuard, PermissionGuard)
export class TaskController {
  constructor(
    private readonly crmService: CrmService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  @Get()
  @RequirePermission('task', 'read')
  async listTasks(@Req() req: FastifyRequest, @Query() dto: ListTasksDto) {
    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);
    const assignedPositionId = this.resolveOwnerFilter(
      await this.ownerFilterForAction(tenantContext.positionId, 'read'),
      dto.assignedPositionId,
    );

    return this.crmService.listTasks({
      organizationId,
      assignedPositionId,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      contactId: dto.contactId ? new Types.ObjectId(dto.contactId) : undefined,
      status: dto.status,
      dueBefore: dto.dueBefore ? new Date(dto.dueBefore) : undefined,
      dueAfter: dto.dueAfter ? new Date(dto.dueAfter) : undefined,
      cursor: dto.cursor ? new Types.ObjectId(dto.cursor) : undefined,
      limit: dto.limit,
    });
  }

  @Get(':taskId')
  @RequirePermission('task', 'read')
  async getTask(
    @Req() req: FastifyRequest,
    @Param('taskId', ParseObjectIdPipe) taskId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getTask({
      taskId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      assignedPositionId: await this.ownerFilterForAction(tenantContext.positionId, 'read'),
    });
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('task', 'create')
  async createTask(@Req() req: FastifyRequest, @Body() dto: CreateTaskDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.createTask({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      requiredScopePositionId: await this.ownerFilterForAction(tenantContext.positionId, 'create'),
      title: dto.title,
      description: dto.description,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      assignedPositionId: dto.assignedPositionId ? new Types.ObjectId(dto.assignedPositionId) : undefined,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      contactId: dto.contactId ? new Types.ObjectId(dto.contactId) : undefined,
      correlationId: req.correlationId,
    });
  }

  @Patch(':taskId')
  @HttpCode(200)
  @RequirePermission('task', 'edit')
  async updateTask(
    @Req() req: FastifyRequest,
    @Param('taskId', ParseObjectIdPipe) taskId: Types.ObjectId,
    @Body() dto: UpdateTaskDto,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.updateTask({
      taskId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      requiredScopePositionId: await this.ownerFilterForAction(tenantContext.positionId, 'edit'),
      title: dto.title,
      description: dto.description,
      dueAt: dto.dueAt !== undefined ? (dto.dueAt ? new Date(dto.dueAt) : null) : undefined,
      assignedPositionId:
        dto.assignedPositionId !== undefined
          ? dto.assignedPositionId
            ? new Types.ObjectId(dto.assignedPositionId)
            : null
          : undefined,
      status: dto.status,
      correlationId: req.correlationId,
    });
  }

  @Post(':taskId/complete')
  @HttpCode(200)
  @RequirePermission('task', 'complete')
  async completeTask(
    @Req() req: FastifyRequest,
    @Param('taskId', ParseObjectIdPipe) taskId: Types.ObjectId,
  ) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.completeTask({
      taskId,
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      actorPositionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      requiredScopePositionId: await this.ownerFilterForAction(tenantContext.positionId, 'complete'),
      correlationId: req.correlationId,
    });
  }

  private resolveOwnerFilter(
    scopeFilter: Types.ObjectId | undefined,
    clientAssignedPositionId: string | undefined,
  ): Types.ObjectId | undefined {
    if (!clientAssignedPositionId) {
      return scopeFilter;
    }
    const requested = new Types.ObjectId(clientAssignedPositionId);
    if (scopeFilter && !scopeFilter.equals(requested)) {
      throw new BadRequestException('assignedPositionId filter is outside the caller permission scope');
    }
    return requested;
  }

  private async ownerFilterForAction(positionId: string, action: string): Promise<Types.ObjectId | undefined> {
    const positionObjectId = new Types.ObjectId(positionId);
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionObjectId,
      resource: 'task',
      action,
    });
    return scopes.some((scope) => scope === 'organization' || scope === 'global')
      ? undefined
      : positionObjectId;
  }
}
