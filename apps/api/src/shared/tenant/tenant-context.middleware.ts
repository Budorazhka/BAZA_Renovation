import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import { SessionService } from '../../modules/identity/session.service';
import { PositionAssignmentService } from '../../modules/organizations/position-assignment.service';
import { OrganizationRepository } from '../../modules/organizations/repository/organization.repository';
import type { TenantContext, VerifiedTenantContext } from './tenant-context';

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: VerifiedTenantContext;
    /**
     * Mirrors AdminContextMiddleware's hadSessionCookie (see that file's
     * comment for the full rationale) — lets TenantGuard distinguish "guest,
     * no baza_session cookie at all" (401 AUTH_NO_SESSION) from "cookie
     * present but doesn't resolve to a valid TenantContext" (403 FORBIDDEN,
     * non-disclosure of the exact reason). Previously TenantGuard had no
     * such distinction and always threw 403, unlike AdminGuard — this
     * closes that asymmetry between the two audiences.
     */
    hadSessionCookieErp?: boolean;
    /**
     * Сессия и позиция в порядке, но организация заморожена админом
     * (решение владельца 11.09.2026: заморозка закрывает вход сотрудникам).
     * Контекст в этом случае не строится, а TenantGuard по флагу отвечает
     * понятной причиной вместо общего FORBIDDEN: сотрудник должен видеть,
     * что дело в организации, а не в его собственных правах.
     */
    organizationFrozen?: boolean;
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
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async use(req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    req.hadSessionCookieErp = this.sessionService.getRawTokenFromRequest(req) !== undefined;

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

    // Заморозка организации действует на уже выданные сессии сразу, а не
    // после их истечения: проверка на каждом запросе, а не только на входе.
    // Отзыв сессий сотрудников такого эффекта не даёт — заново войти они
    // смогли бы тем же паролем.
    const organization = await this.organizationRepository.findById(new Types.ObjectId(assignment.organizationId));
    if (!organization || organization.status !== 'active') {
      req.organizationFrozen = true;
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
