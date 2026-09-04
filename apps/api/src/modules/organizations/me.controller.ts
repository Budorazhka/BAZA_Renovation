import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { AuthService } from '../identity/auth.service';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { OrganizationsService } from './organizations.service';
import { TeamService } from './team.service';
import type { ErpMeResponseDto } from './dto/erp-me-response.dto';

/**
 * GET /me (security: [cookieAuth] — ERP tenant session).
 * Канонический эндпоинт контекста текущего пользователя для ERP-клиента.
 * Возвращает данные Identity, Organization, Position и активные PermissionGrants,
 * выводя scope исключительно из серверного TenantContext (ADR-002, ADR-004).
 */
@Controller('me')
@UseGuards(TenantGuard)
export class MeController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly teamService: TeamService,
    private readonly authService: AuthService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  @Get()
  async me(@Req() req: FastifyRequest): Promise<ErpMeResponseDto> {
    const tenantContext = requireTenantContext(req);
    const orgId = new Types.ObjectId(tenantContext.organizationId);
    const posId = new Types.ObjectId(tenantContext.positionId);
    const idId = new Types.ObjectId(tenantContext.identityId);

    const [identities, organization, positionView, grants] = await Promise.all([
      this.authService.findByIds([idId]),
      this.organizationsService.getOrganizationById(orgId),
      this.teamService.ensureSelf(orgId, posId),
      this.policyEvaluator.listGrantsForSubject('position', posId),
    ]);

    const identity = identities[0];
    if (!identity) {
      throw new NotFoundException('Identity not found');
    }

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!positionView) {
      throw new NotFoundException('Position not found');
    }

    return {
      identity: {
        id: identity.id.toString(),
        login: identity.normalizedLogin,
        status: identity.status,
      },
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        type: organization.type,
        status: organization.status,
      },
      position: {
        id: positionView.positionId,
        role: positionView.role,
        displayName: positionView.name,
        parentPositionId: positionView.parentPositionId,
        avatarUrl: positionView.avatarUrl,
      },
      permissions: grants.map((g) => ({
        resource: g.resource,
        action: g.action,
        scope: g.scope,
        scopeValue: g.scopeValue,
      })),
    };
  }
}
