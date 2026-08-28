import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Зеркало TenantGuard/AdminGuard: требует, чтобы
 * MarketplaceAccountContextMiddleware успешно построил контекст для этого
 * запроса. Применяется на marketplace-account controller'ах (owner/realtor
 * publishing wizard) — физически отдельный guard, не условная ветка одного
 * guard'а на все три контура.
 */
@Injectable()
export class MarketplaceAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.marketplaceAccountContext) {
      throw new AppException(ErrorCode.FORBIDDEN, 'No active marketplace account context for this request');
    }
    return true;
  }
}
