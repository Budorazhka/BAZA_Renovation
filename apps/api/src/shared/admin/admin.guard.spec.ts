import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { ErrorCode } from '../errors/error-codes';
import './admin-context.middleware';

function makeContext(req: Partial<{ adminContext: unknown; hadSessionCookie: boolean }>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

/**
 * ИЗМЕНЕНО: AdminGuard раньше всегда бросал 403 FORBIDDEN для любого
 * отсутствующего AdminContext. Теперь различает "нет cookie вообще" (401
 * AUTH_NO_SESSION) от "cookie есть, но контекст не резолвился" (403
 * FORBIDDEN, тот же non-disclosure принцип, что и раньше) — нужно, чтобы
 * POST /auth/logout честно возвращал 401 на следующий GET /admin/me.
 */
describe('AdminGuard — 401 vs 403', () => {
  const guard = new AdminGuard();

  it('пропускает запрос с валидным adminContext', () => {
    expect(guard.canActivate(makeContext({ adminContext: { adminAccountId: 'x' }, hadSessionCookie: true }))).toBe(true);
  });

  it('нет cookie вообще (hadSessionCookie:false) — 401 AUTH_NO_SESSION', () => {
    try {
      guard.canActivate(makeContext({ adminContext: undefined, hadSessionCookie: false }));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.AUTH_NO_SESSION);
      expect((error as { getStatus: () => number }).getStatus()).toBe(401);
    }
  });

  it('cookie есть, но контекст не резолвился (hadSessionCookie:true) — 403 FORBIDDEN, не раскрывает причину', () => {
    try {
      guard.canActivate(makeContext({ adminContext: undefined, hadSessionCookie: true }));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect((error as { code: ErrorCode }).code).toBe(ErrorCode.FORBIDDEN);
      expect((error as { getStatus: () => number }).getStatus()).toBe(403);
    }
  });
});
