import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { SessionService } from '../../modules/identity/session.service';
import { PositionAssignmentService } from '../../modules/organizations/position-assignment.service';
import type { TenantContext, VerifiedTenantContext } from './tenant-context';

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: VerifiedTenantContext;
  }
}

/**
 * Строит TenantContext исключительно из сервера: session (по tokenHash из cookie)
 * + активный PositionAssignment этой identity. Не читает organizationId из
 * body/query/headers клиента ни при каких условиях (ADR-002 требование 1).
 *
 * Не выбрасывает ошибку сам по себе, если контекст не удалось построить —
 * просто не устанавливает request.tenantContext. Guard'ы конкретных
 * ERP-endpoint'ов (TenantGuard) требуют его наличия явно; публичные
 * endpoint'ы работают без него.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly sessionService: SessionService,
    private readonly positionAssignmentService: PositionAssignmentService,
  ) {}

  async use(req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    const session = await this.sessionService.getActiveSessionFromRequest(req, 'erp');
    if (!session) {
      next();
      return;
    }

    const assignment = await this.positionAssignmentService.getActiveAssignmentForIdentity(
      session.identityId,
    );
    if (!assignment) {
      // Валидная ERP-сессия, но нет активной позиции (например, только что vacated) —
      // не строим tenant context, downstream TenantGuard отклонит запрос как FORBIDDEN,
      // не как AUTH_SESSION_REVOKED (сессия сама по себе валидна).
      next();
      return;
    }

    const context: TenantContext = {
      organizationId: assignment.organizationId,
      positionId: assignment.positionId,
      identityId: session.identityId,
    };
    req.tenantContext = context as VerifiedTenantContext;
    next();
  }
}

/**
 * Явная функция извлечения контекста для guard'ов/controller'ов —
 * единственный способ получить VerifiedTenantContext, кроме прямого
 * обращения к request.tenantContext. Бросает, если контекст отсутствует —
 * вызывающий код (обычно TenantGuard) обязан проверить наличие заранее.
 */
export function requireTenantContext(req: FastifyRequest): VerifiedTenantContext {
  if (!req.tenantContext) {
    throw new UnauthorizedException('TenantContext not established for this request');
  }
  return req.tenantContext;
}
