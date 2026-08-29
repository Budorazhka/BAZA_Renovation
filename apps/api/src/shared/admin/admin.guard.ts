import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import './admin-context.middleware';

/**
 * Зеркало TenantGuard (ADR-002 требование 6): требует, чтобы
 * AdminContextMiddleware успешно построил контекст для этого запроса.
 * Применяется на всех Admin-controller'ах — физически отдельный guard от
 * TenantGuard, не условная ветка одного guard'а на оба контура.
 *
 * 401 vs 403 (ИЗМЕНЕНО — до этого прохода всегда был 403, см.
 * admin-control-plane.md "Известные ограничения"): различаем "гость без
 * единой baza_session cookie" (401 AUTH_NO_SESSION — нет самой попытки
 * аутентификации, безопасно раскрыть) от "cookie есть, но не резолвится в
 * валидный AdminContext" (403 FORBIDDEN — причина может быть любой: мусорный
 * токен, чужой audience, деактивированный AdminAccount — не раскрываем
 * какой именно, тот же non-disclosure принцип, что и раньше). Нужно для
 * POST /auth/logout: после logout cookie реально стёрта браузером/сервером,
 * следующий GET /admin/me идёт БЕЗ cookie — контракт задачи требует именно
 * 401 в этом случае, не generic 403.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.adminContext) {
      if (!req.hadSessionCookie) {
        throw new AppException(ErrorCode.AUTH_NO_SESSION, 'No session cookie present on this request');
      }
      throw new AppException(ErrorCode.FORBIDDEN, 'No active admin context for this request');
    }
    return true;
  }
}
