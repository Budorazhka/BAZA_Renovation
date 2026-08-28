import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { requireAdminContext } from '../../shared/admin/admin-context.middleware';
import { AdminPolicyService } from './admin-policy.service';

/**
 * GET /admin/me — не в OpenAPI-спеке (v1-first-vertical-slice.yaml
 * специфицирует только adminUnpublish/adminListPublications), тот же
 * паттерн honest-gap расширения, что admin/accounts. admin-web
 * использует это, чтобы (а) отличить "не вошёл" от "вошёл, но нет
 * активного AdminAccount" на клиенте — AdminGuard сам всегда отдаёт 403
 * FORBIDDEN на оба случая (admin-context.middleware.ts комментарий),
 * никогда 401 — и (б) отрендерить scope-aware UI (скрыть "Управление
 * аккаунтами" для НЕ-super_admin, показать дефолтный набор городов в
 * фильтре публикаций). Чистое чтение уже существующей
 * AdminPolicyService.resolvePublicationReadScope поверх HTTP, без нового
 * domain-состояния — отдельный контроллер, не метод AdminAccountController,
 * чтобы "me" никогда не пересекался маршрутом с :adminAccountId.
 */
@Controller('admin/me')
@UseGuards(AdminGuard)
export class AdminMeController {
  constructor(private readonly adminPolicy: AdminPolicyService) {}

  @Get()
  async me(@Req() req: FastifyRequest) {
    const adminContext = requireAdminContext(req);
    const readScope = await this.adminPolicy.resolvePublicationReadScope(adminContext);
    return {
      adminAccountId: adminContext.adminAccountId,
      isSuperAdmin: adminContext.isSuperAdmin,
      publicationReadScope:
        readScope === 'all'
          ? ('all' as const)
          : Object.fromEntries(Array.from(readScope.entries()).map(([sourceType, scope]) => [sourceType, scope])),
    };
  }
}
