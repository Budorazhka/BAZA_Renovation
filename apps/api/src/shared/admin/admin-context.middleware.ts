import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import { SessionService } from '../../modules/identity/session.service';
import { AdminAccountRepository } from '../../modules/admin/repository/admin-account.repository';
import type { AdminContext, VerifiedAdminContext } from './admin-context';

declare module 'fastify' {
  interface FastifyRequest {
    adminContext?: VerifiedAdminContext;
  }
}

/**
 * Зеркало TenantContextMiddleware (ADR-002 требование 6, ADR-009): строит
 * AdminContext исключительно из сервера — admin-audience session (по
 * tokenHash из cookie) + активный AdminAccount этой identity. Физически
 * ОТДЕЛЬНЫЙ middleware/контур от TenantContextMiddleware, не условная ветка
 * в одном коде — Admin и ERP identity-пространства не должны смешиваться
 * даже случайно.
 *
 * Не бросает ошибку сама по себе, если контекст не удалось построить —
 * AdminGuard требует его наличия явно (тот же принцип, что TenantGuard).
 */
@Injectable()
export class AdminContextMiddleware implements NestMiddleware {
  constructor(
    private readonly sessionService: SessionService,
    private readonly adminAccountRepository: AdminAccountRepository,
  ) {}

  async use(req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    const session = await this.sessionService.getActiveSessionFromRequest(req, 'admin');
    if (!session) {
      next();
      return;
    }

    const identityId = new Types.ObjectId(session.identityId);
    const adminAccount = await this.adminAccountRepository.findActiveByIdentityId(identityId);
    if (!adminAccount) {
      // Валидная admin-audience сессия, но нет активного AdminAccount —
      // downstream AdminGuard отклонит запрос как FORBIDDEN, не как
      // AUTH_SESSION_REVOKED (сессия сама по себе валидна).
      next();
      return;
    }

    const context: AdminContext = {
      identityId: session.identityId,
      adminAccountId: adminAccount._id.toString(),
      isSuperAdmin: adminAccount.isSuperAdmin,
    };
    req.adminContext = context as VerifiedAdminContext;
    next();
  }
}

/**
 * Явная функция извлечения контекста — единственный способ получить
 * VerifiedAdminContext, кроме прямого обращения к request.adminContext.
 * Бросает, если контекст отсутствует — вызывающий код (обычно AdminGuard)
 * обязан проверить наличие заранее.
 */
export function requireAdminContext(req: FastifyRequest): VerifiedAdminContext {
  if (!req.adminContext) {
    throw new UnauthorizedException('AdminContext not established for this request');
  }
  return req.adminContext;
}
