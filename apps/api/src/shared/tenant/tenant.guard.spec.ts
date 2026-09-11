import { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { ErrorCode } from '../errors/error-codes';
import './tenant-context.middleware';

function makeContext(
  req: Partial<{ tenantContext: unknown; hadSessionCookieErp: boolean; organizationFrozen: boolean }>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/**
 * Зеркало admin.guard.spec.ts (см. его комментарий): TenantGuard раньше
 * всегда бросал 403 FORBIDDEN для любого отсутствующего TenantContext.
 * Теперь различает "нет cookie вообще" (401 AUTH_NO_SESSION) от "cookie
 * есть, но контекст не резолвился" (403 FORBIDDEN, non-disclosure).
 */
describe('TenantGuard — 401 vs 403', () => {
  const guard = new TenantGuard();

  it('пропускает запрос с валидным tenantContext', () => {
    expect(
      guard.canActivate(
        makeContext({ tenantContext: { organizationId: 'org-1' }, hadSessionCookieErp: true }),
      ),
    ).toBe(true);
  });

  it('нет cookie вообще (hadSessionCookieErp:false) — 401 AUTH_NO_SESSION', () => {
    try {
      guard.canActivate(makeContext({ tenantContext: undefined, hadSessionCookieErp: false }));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.AUTH_NO_SESSION);
      expect((error as { getStatus: () => number }).getStatus()).toBe(401);
    }
  });

  it('cookie есть, но контекст не резолвился (hadSessionCookieErp:true) — 403 FORBIDDEN, не раскрывает причину', () => {
    try {
      guard.canActivate(makeContext({ tenantContext: undefined, hadSessionCookieErp: true }));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.FORBIDDEN);
      expect((error as { getStatus: () => number }).getStatus()).toBe(403);
    }
  });

  it('организация заморожена — 403 ORGANIZATION_FROZEN, причина названа прямо', () => {
    try {
      guard.canActivate(
        makeContext({ tenantContext: undefined, hadSessionCookieErp: true, organizationFrozen: true }),
      );
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.ORGANIZATION_FROZEN);
      expect((error as { getStatus: () => number }).getStatus()).toBe(403);
    }
  });
});
