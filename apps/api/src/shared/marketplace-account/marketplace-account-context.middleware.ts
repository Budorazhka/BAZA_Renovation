import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { SessionService } from '../../modules/identity/session.service';
import type { MarketplaceAccountContext, VerifiedMarketplaceAccountContext } from './marketplace-account-context';

declare module 'fastify' {
  interface FastifyRequest {
    marketplaceAccountContext?: VerifiedMarketplaceAccountContext;
    /**
     * Mirrors AdminContextMiddleware's hadSessionCookie / TenantContextMiddleware's
     * hadSessionCookieErp — lets MarketplaceAccountGuard distinguish "guest,
     * no baza_session cookie at all" (401 AUTH_NO_SESSION) from "cookie
     * present but doesn't resolve to a valid MarketplaceAccountContext" (403
     * FORBIDDEN, non-disclosure). Closes the same asymmetry this had with
     * the admin audience.
     */
    hadSessionCookieMarketplace?: boolean;
  }
}

/**
 * Зеркало AdminContextMiddleware/TenantContextMiddleware — строит контекст
 * исключительно из сервера: marketplace-audience session (по tokenHash из
 * cookie). В отличие от обоих остальных middleware, здесь НЕТ второго
 * lookup (PositionAssignment для ERP, AdminAccount для Admin) — валидная
 * marketplace-сессия САМА ПО СЕБЕ достаточна (AuthService.login()
 * докстринг: "marketplace НЕ требует ProductAccess... базовый доступ любой
 * активной Identity"). Не бросает ошибку сама по себе, если сессии нет —
 * MarketplaceAccountGuard требует контекст явно (тот же принцип, что
 * TenantGuard/AdminGuard).
 */
@Injectable()
export class MarketplaceAccountContextMiddleware implements NestMiddleware {
  constructor(private readonly sessionService: SessionService) {}

  async use(req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    req.hadSessionCookieMarketplace = this.sessionService.getRawTokenFromRequest(req) !== undefined;

    const session = await this.sessionService.getActiveSessionFromRequest(req, 'marketplace');
    if (!session) {
      next();
      return;
    }

    const context: MarketplaceAccountContext = { identityId: session.identityId };
    req.marketplaceAccountContext = context as VerifiedMarketplaceAccountContext;
    next();
  }
}

/**
 * Явная функция извлечения контекста — единственный способ получить
 * VerifiedMarketplaceAccountContext, кроме прямого обращения к
 * request.marketplaceAccountContext. Бросает, если контекст отсутствует —
 * вызывающий код (обычно MarketplaceAccountGuard) обязан проверить наличие
 * заранее.
 */
export function requireMarketplaceAccountContext(req: FastifyRequest): VerifiedMarketplaceAccountContext {
  if (!req.marketplaceAccountContext) {
    throw new UnauthorizedException('MarketplaceAccountContext not established for this request');
  }
  return req.marketplaceAccountContext;
}
