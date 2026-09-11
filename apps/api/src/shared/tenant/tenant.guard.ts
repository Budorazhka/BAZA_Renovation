import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Требует, чтобы TenantContextMiddleware успешно построил контекст для этого
 * запроса. Применяется на всех ERP tenant-scoped controller'ах — не на
 * публичных marketplace-endpoint'ах и не на Admin-endpoint'ах (у тех свой
 * AdminGuard, отдельный от этого, ADR-002 требование 6).
 *
 * 401 vs 403: зеркалирует AdminGuard (см. его комментарий) — различаем
 * "гость без единой baza_session cookie" (401 AUTH_NO_SESSION) от "cookie
 * есть, но не резолвится в валидный TenantContext" (403 FORBIDDEN,
 * non-disclosure причины — истёкшая/отозванная/чужая-audience сессия,
 * валидная сессия без активной позиции — не раскрываем, какая именно).
 * Тот же практический эффект, что для admin: после POST /auth/logout
 * следующий защищённый ERP-запрос идёт БЕЗ cookie и должен получить именно
 * 401, не generic 403 — раньше TenantGuard этого не различал.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.tenantContext) {
      if (!req.hadSessionCookieErp) {
        throw new AppException(ErrorCode.AUTH_NO_SESSION, 'No session cookie present on this request');
      }
      // Заморозка — единственная причина отказа, которую сотруднику
      // называют прямо: скрывать её незачем (он всё равно узнает от
      // руководителя), а общий FORBIDDEN отправил бы разбираться в права.
      if (req.organizationFrozen) {
        throw new AppException(ErrorCode.ORGANIZATION_FROZEN, 'Organization is frozen, access is suspended');
      }
      throw new AppException(ErrorCode.FORBIDDEN, 'No active tenant context for this request');
    }
    return true;
  }
}
