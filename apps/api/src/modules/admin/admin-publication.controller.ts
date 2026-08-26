import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminPublicationService } from './admin-publication.service';
import { UnpublishRequestDto } from './dto/unpublish-request.dto';

/**
 * OpenAPI v1-first-vertical-slice.yaml `adminUnpublish`. AdminGuard здесь —
 * ТОЛЬКО аутентификация Admin-актора (аналог TenantGuard), не permission-
 * проверка — та выполняется динамически внутри AdminPublicationService
 * ПОСЛЕ чтения целевой записи (resource/scope известны только тогда, см.
 * комментарий в AdminPublicationService.unpublish). Не PermissionGuard
 * (тот статичен, для ERP-стороны — не подходит здесь структурно).
 */
@Controller('admin/publications')
@UseGuards(AdminGuard)
export class AdminPublicationController {
  constructor(private readonly adminPublicationService: AdminPublicationService) {}

  @Post(':publicationId/unpublish')
  @HttpCode(200)
  async unpublish(
    @Req() req: FastifyRequest,
    @Param('publicationId') publicationIdParam: string,
    @Body() dto: UnpublishRequestDto,
  ) {
    const adminContext = requireAdminContext(req);

    return this.adminPublicationService.unpublish(adminContext, {
      publicationId: new Types.ObjectId(publicationIdParam),
      reason: dto.reason,
      correlationId: req.correlationId,
    });
  }
}
