import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { PERMISSION_METADATA_KEY, type RequiredPermission } from './require-permission.decorator';

/**
 * Deny-by-default enforcement на уровне HTTP-запроса (ADR-002, permission-matrix.md).
 * Требует TenantGuard ВПЕРЕДИ себя в цепочке guard'ов — читает
 * TenantContext.positionId как subjectId для проверки. Работает только
 * для ERP tenant-scoped endpoint'ов; Admin-endpoint'ы используют отдельный
 * AdminPermissionGuard (не входит в этот первый проход C-07 — Admin scope
 * enforcement специфицирован в ADR-009/permission-matrix.md раздел 2,
 * реализуется отдельно при построении Admin-модуля на Этапе 8, не забыто).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );

    // Отсутствие @RequirePermission на методе — НЕ deny-by-default здесь,
    // это programming error (забыли явно указать требуемое право) —
    // намеренно бросаем, а не молча пропускаем, чтобы такую ошибку
    // ловили на этапе разработки/review, не в production как security hole.
    if (!required) {
      throw new Error(
        `PermissionGuard применён к handler без @RequirePermission — явно укажите требуемое право`,
      );
    }

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const tenantContext = requireTenantContext(req);

    const allowed = await this.policyEvaluator.evaluate({
      subjectType: 'position',
      subjectId: new Types.ObjectId(tenantContext.positionId),
      resource: required.resource,
      action: required.action,
    });

    if (!allowed) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        `Недостаточно прав: ${required.resource}.${required.action}`,
      );
    }

    return true;
  }
}
