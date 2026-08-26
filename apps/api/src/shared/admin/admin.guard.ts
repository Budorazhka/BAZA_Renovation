import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Зеркало TenantGuard (ADR-002 требование 6): требует, чтобы
 * AdminContextMiddleware успешно построил контекст для этого запроса.
 * Применяется на всех Admin-controller'ах — физически отдельный guard от
 * TenantGuard, не условная ветка одного guard'а на оба контура.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.adminContext) {
      throw new AppException(ErrorCode.FORBIDDEN, 'No active admin context for this request');
    }
    return true;
  }
}
