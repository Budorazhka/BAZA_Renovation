import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminPublicationService } from './admin-publication.service';
import { UnpublishRequestDto } from './dto/unpublish-request.dto';
import { ListPublicationsQueryDto } from './dto/list-publications-query.dto';

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

  /**
   * D-06: "Admin может найти publication только в разрешённом scope"
   * (мастер-план) — до этого метода не было HTTP-пути найти publication,
   * только unpublish по уже известному ID. Permission-проверка — та же
   * in-service дисциплина, что unpublish (AdminGuard здесь только
   * аутентификация).
   */
  @Get()
  async list(@Req() req: FastifyRequest, @Query() dto: ListPublicationsQueryDto) {
    const adminContext = requireAdminContext(req);
    return this.adminPublicationService.list(adminContext, dto);
  }

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
