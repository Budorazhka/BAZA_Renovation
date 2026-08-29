import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminAuditService } from './admin-audit.service';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';
import { ListPublicationAuditQueryDto } from './dto/list-publication-audit-query.dto';

function toObjectIdOrUndefined(value: string | undefined): Types.ObjectId | undefined {
  return value ? new Types.ObjectId(value) : undefined;
}

/**
 * Read-only admin audit trail (D-07). AdminGuard здесь — ТОЛЬКО
 * аутентификация (тот же принцип, что AdminPublicationController) —
 * scope/permission-проверка (scoped admin vs super_admin, publication
 * read-scope) выполняется внутри AdminAuditService, т.к. resource-scope
 * зависит от query-параметров запроса, не статичен на уровне маршрута.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get('audit-events')
  async listAuditEvents(@Req() req: FastifyRequest, @Query() dto: ListAuditEventsQueryDto) {
    const adminContext = requireAdminContext(req);
    return this.adminAuditService.list(adminContext, {
      resource: dto.resource,
      action: dto.action,
      resourceId: toObjectIdOrUndefined(dto.resourceId),
      publicationId: toObjectIdOrUndefined(dto.publicationId),
      actorId: toObjectIdOrUndefined(dto.actorId),
      from: dto.from,
      to: dto.to,
      cursor: toObjectIdOrUndefined(dto.cursor),
      limit: dto.limit,
    });
  }

  /**
   * Publication detail screen: показывает audit-историю ОДНОЙ publication
   * без клиента, вручную собирающего resource+resourceId (sourceType/
   * sourceId publication не всегда очевидны на UI-стороне — id publication
   * записи и id её sourceId/sourceType — разные вещи, см.
   * AdminAuditService.buildClientFilter). Переиспользует тот же
   * service/whitelist, что listAuditEvents — не отдельная бизнес-логика.
   */
  @Get('publications/:publicationId/audit')
  async listPublicationAudit(
    @Req() req: FastifyRequest,
    @Param('publicationId') publicationIdParam: string,
    @Query() dto: ListPublicationAuditQueryDto,
  ) {
    const adminContext = requireAdminContext(req);
    return this.adminAuditService.listForPublication(adminContext, new Types.ObjectId(publicationIdParam), {
      action: dto.action,
      from: dto.from,
      to: dto.to,
      cursor: toObjectIdOrUndefined(dto.cursor),
      limit: dto.limit,
    });
  }
}
