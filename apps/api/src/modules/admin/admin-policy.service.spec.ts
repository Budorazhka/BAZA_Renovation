import { Types } from 'mongoose';
import { AdminPolicyService } from './admin-policy.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

describe('AdminPolicyService.requireGrant', () => {
  /**
   * ADR-009 разд. "super_admin": "enforced на уровне отдельной проверки
   * adminAccount.role == 'super_admin'... не через PermissionGrant-записи".
   */
  it('super_admin проходит без обращения к PolicyEvaluatorService', async () => {
    const evaluateSpy = jest.fn();
    const service = new AdminPolicyService({ evaluate: evaluateSpy } as unknown as PolicyEvaluatorService);

    await service.requireGrant({
      adminContext: makeAdminContext({ isSuperAdmin: true }),
      resource: 'development',
      action: 'unpublish',
      scopeValue: 'batumi',
    });

    expect(evaluateSpy).not.toHaveBeenCalled();
  });

  it('обычный AdminAccount с грантом — evaluate вызывается с subjectType:admin_account', async () => {
    const adminContext = makeAdminContext();
    const evaluateSpy = jest.fn().mockResolvedValue(true);
    const service = new AdminPolicyService({ evaluate: evaluateSpy } as unknown as PolicyEvaluatorService);

    await service.requireGrant({
      adminContext,
      resource: 'development',
      action: 'unpublish',
      scopeValue: 'batumi',
    });

    expect(evaluateSpy).toHaveBeenCalledWith({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(adminContext.adminAccountId),
      resource: 'development',
      action: 'unpublish',
      requestedScopeValue: 'batumi',
    });
  });

  it('deny-by-default: evaluate возвращает false → ADMIN_SCOPE_INSUFFICIENT', async () => {
    const service = new AdminPolicyService({
      evaluate: jest.fn().mockResolvedValue(false),
    } as unknown as PolicyEvaluatorService);

    await expect(
      service.requireGrant({ adminContext: makeAdminContext(), resource: 'development', action: 'unpublish' }),
    ).rejects.toMatchObject(expect.objectContaining({ code: ErrorCode.ADMIN_SCOPE_INSUFFICIENT }));
  });
});

describe('AdminPolicyService.requireReason', () => {
  const service = new AdminPolicyService({} as unknown as PolicyEvaluatorService);

  it('пропускает валидный reason (>=10 символов)', () => {
    expect(() => service.requireReason('Duplicate listing detected')).not.toThrow();
  });

  it('отклоняет undefined reason', () => {
    expect(() => service.requireReason(undefined)).toThrow(AppException);
  });

  it('отклоняет reason короче 10 символов', () => {
    expect(() => service.requireReason('too short')).toThrow(
      expect.objectContaining({ code: ErrorCode.ADMIN_REASON_REQUIRED }),
    );
  });

  it('отклоняет reason из одних пробелов (trim перед проверкой длины)', () => {
    expect(() => service.requireReason('           ')).toThrow(AppException);
  });
});

describe('AdminPolicyService.resolvePublicationReadScope', () => {
  it("super_admin → 'all' без единого обращения к PolicyEvaluatorService", async () => {
    const resolveListScopeSpy = jest.fn();
    const service = new AdminPolicyService({ resolveListScope: resolveListScopeSpy } as unknown as PolicyEvaluatorService);

    const result = await service.resolvePublicationReadScope(makeAdminContext({ isSuperAdmin: true }));

    expect(result).toBe('all');
    expect(resolveListScopeSpy).not.toHaveBeenCalled();
  });

  it('обычный admin — вызывает resolveListScope по каждому из трёх sourceType с action:read', async () => {
    const adminContext = makeAdminContext();
    const resolveListScopeSpy = jest.fn().mockResolvedValue({ global: false, scopeValues: [] });
    const service = new AdminPolicyService({ resolveListScope: resolveListScopeSpy } as unknown as PolicyEvaluatorService);

    await service.resolvePublicationReadScope(adminContext);

    expect(resolveListScopeSpy).toHaveBeenCalledTimes(3);
    for (const sourceType of ['development', 'unit', 'listing']) {
      expect(resolveListScopeSpy).toHaveBeenCalledWith({
        subjectType: 'admin_account',
        subjectId: new Types.ObjectId(adminContext.adminAccountId),
        resource: sourceType,
        action: 'read',
      });
    }
  });

  it('sourceType без единого grant (global:false, cities:[]) — не попадает в итоговый Map', async () => {
    const resolveListScopeSpy = jest.fn().mockImplementation(({ resource }) =>
      Promise.resolve(resource === 'development' ? { global: true, scopeValues: [] } : { global: false, scopeValues: [] }),
    );
    const service = new AdminPolicyService({ resolveListScope: resolveListScopeSpy } as unknown as PolicyEvaluatorService);

    const result = await service.resolvePublicationReadScope(makeAdminContext());

    expect(result).not.toBe('all');
    const map = result as Map<string, { global: boolean; cities: string[] }>;
    expect(map.has('development')).toBe(true);
    expect(map.has('unit')).toBe(false);
    expect(map.has('listing')).toBe(false);
  });

  it('несколько city-grants на один sourceType агрегируются в cities[]', async () => {
    const resolveListScopeSpy = jest.fn().mockImplementation(({ resource }) =>
      Promise.resolve(resource === 'development' ? { global: false, scopeValues: ['batumi', 'tbilisi'] } : { global: false, scopeValues: [] }),
    );
    const service = new AdminPolicyService({ resolveListScope: resolveListScopeSpy } as unknown as PolicyEvaluatorService);

    const result = await service.resolvePublicationReadScope(makeAdminContext());

    const map = result as Map<string, { global: boolean; cities: string[] }>;
    expect(map.get('development')).toEqual({ global: false, cities: ['batumi', 'tbilisi'] });
  });
});
