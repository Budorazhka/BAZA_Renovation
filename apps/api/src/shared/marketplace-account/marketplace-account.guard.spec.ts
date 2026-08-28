import type { ExecutionContext } from '@nestjs/common';
import { MarketplaceAccountGuard } from './marketplace-account.guard';
import { AppException } from '../errors/app-exception';

function makeContext(marketplaceAccountContext: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ marketplaceAccountContext }),
    }),
  } as unknown as ExecutionContext;
}

describe('MarketplaceAccountGuard', () => {
  it('пропускает запрос с установленным marketplaceAccountContext', () => {
    const guard = new MarketplaceAccountGuard();
    expect(guard.canActivate(makeContext({ identityId: 'abc' }))).toBe(true);
  });

  it('бросает AppException(FORBIDDEN), если контекст не установлен', () => {
    const guard = new MarketplaceAccountGuard();
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(AppException);
  });
});
