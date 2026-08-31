import { UnauthorizedException } from '@nestjs/common';
import { MarketplaceAccountContextMiddleware, requireMarketplaceAccountContext } from './marketplace-account-context.middleware';
import type { SessionService } from '../../modules/identity/session.service';

describe('MarketplaceAccountContextMiddleware', () => {
  it('строит контекст из marketplace-audience сессии (identityId, без organizationId/positionId)', async () => {
    const sessionService = {
      getActiveSessionFromRequest: jest.fn().mockResolvedValue({ identityId: 'identity-1' }),
      getRawTokenFromRequest: jest.fn().mockReturnValue('raw-token'),
    } as unknown as SessionService;
    const middleware = new MarketplaceAccountContextMiddleware(sessionService);
    const req = {} as never;
    const next = jest.fn();

    await middleware.use(req, {} as never, next);

    expect(sessionService.getActiveSessionFromRequest).toHaveBeenCalledWith(req, 'marketplace');
    expect((req as { marketplaceAccountContext?: unknown }).marketplaceAccountContext).toEqual({ identityId: 'identity-1' });
    expect(next).toHaveBeenCalled();
  });

  it('НЕ бросает и НЕ устанавливает контекст, если marketplace-сессии нет — downstream guard отклонит запрос', async () => {
    const sessionService = {
      getActiveSessionFromRequest: jest.fn().mockResolvedValue(null),
      getRawTokenFromRequest: jest.fn().mockReturnValue(undefined),
    } as unknown as SessionService;
    const middleware = new MarketplaceAccountContextMiddleware(sessionService);
    const req = {} as never;
    const next = jest.fn();

    await middleware.use(req, {} as never, next);

    expect((req as { marketplaceAccountContext?: unknown }).marketplaceAccountContext).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('устанавливает hadSessionCookieMarketplace независимо от того, резолвится ли сессия — MarketplaceAccountGuard использует это для 401 vs 403', async () => {
    const sessionService = {
      getActiveSessionFromRequest: jest.fn().mockResolvedValue(null),
      getRawTokenFromRequest: jest.fn().mockReturnValue('garbage-token'),
    } as unknown as SessionService;
    const middleware = new MarketplaceAccountContextMiddleware(sessionService);
    const req = {} as never;
    const next = jest.fn();

    await middleware.use(req, {} as never, next);

    expect((req as { hadSessionCookieMarketplace?: boolean }).hadSessionCookieMarketplace).toBe(true);
  });

  // Реальный найденный класс бага (тот же, что подтверждён D-07 post-fix
  // для TenantContextMiddleware/CorrelationIdMiddleware): NestMiddleware на
  // FastifyAdapter не долетает до Guards через @fastify/middie compat-слой
  // — этот middleware зарегистрирован как нативный onRequest hook в
  // main.api.ts, НЕ через consumer.apply(). Не тестируется здесь напрямую
  // (нужен реальный HTTP-прогон), но НИКОГДА не регистрировать через
  // NestModule.configure() — задокументировано в app.module.ts.
});

describe('requireMarketplaceAccountContext', () => {
  it('возвращает контекст, если он установлен', () => {
    const req = { marketplaceAccountContext: { identityId: 'identity-1' } } as never;
    expect(requireMarketplaceAccountContext(req)).toEqual({ identityId: 'identity-1' });
  });

  it('бросает UnauthorizedException, если контекст не установлен', () => {
    const req = {} as never;
    expect(() => requireMarketplaceAccountContext(req)).toThrow(UnauthorizedException);
  });
});
