import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Требует, чтобы TenantContextMiddleware успешно построил контекст для этого
 * запроса. Применяется на всех ERP tenant-scoped controller'ах — не на
 * публичных marketplace-endpoint'ах и не на Admin-endpoint'ах (у тех свой
 * AdminGuard, отдельный от этого, ADR-002 требование 6).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.tenantContext) {
      throw new AppException(ErrorCode.FORBIDDEN, 'No active tenant context for this request');
    }
    return true;
  }
}
