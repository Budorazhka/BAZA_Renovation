import { ExecutionContext } from '@nestjs/common';
import { MarketplaceAccountGuard } from './marketplace-account.guard';
import { ErrorCode } from '../errors/error-codes';
import './marketplace-account-context.middleware';

function makeContext(
  req: Partial<{ marketplaceAccountContext: unknown; hadSessionCookieMarketplace: boolean }>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/**
 * Зеркало admin.guard.spec.ts (см. его комментарий): MarketplaceAccountGuard
 * раньше всегда бросал 403 FORBIDDEN для любого отсутствующего контекста.
 * Теперь различает "нет cookie вообще" (401 AUTH_NO_SESSION) от "cookie
 * есть, но контекст не резолвился" (403 FORBIDDEN, non-disclosure).
 */
describe('MarketplaceAccountGuard — 401 vs 403', () => {
  const guard = new MarketplaceAccountGuard();

  it('пропускает запрос с валидным marketplaceAccountContext', () => {
    expect(
      guard.canActivate(
        makeContext({ marketplaceAccountContext: { identityId: 'abc' }, hadSessionCookieMarketplace: true }),
      ),
    ).toBe(true);
  });

  it('нет cookie вообще (hadSessionCookieMarketplace:false) — 401 AUTH_NO_SESSION', () => {
    try {
      guard.canActivate(
        makeContext({ marketplaceAccountContext: undefined, hadSessionCookieMarketplace: false }),
      );
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.AUTH_NO_SESSION);
      expect((error as { getStatus: () => number }).getStatus()).toBe(401);
    }
  });

  it('cookie есть, но контекст не резолвился (hadSessionCookieMarketplace:true) — 403 FORBIDDEN, не раскрывает причину', () => {
    try {
      guard.canActivate(
        makeContext({ marketplaceAccountContext: undefined, hadSessionCookieMarketplace: true }),
      );
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.FORBIDDEN);
      expect((error as { getStatus: () => number }).getStatus()).toBe(403);
    }
  });
});
