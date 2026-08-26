import { Types } from 'mongoose';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import type { PermissionGrantRepository } from './repository/permission-grant.repository';
import type { PermissionGrantDocument } from './schemas/permission-grant.schema';

function makeGrant(overrides: Partial<PermissionGrantDocument>): PermissionGrantDocument {
  return {
    resource: 'lead',
    action: 'read',
    scope: 'own',
    ...overrides,
  } as PermissionGrantDocument;
}

/**
 * Deny-by-default (ADR-002, permission-matrix.md) — самый критичный
 * инвариант этого сервиса. Каждый тест ниже проверяет конкретный
 * сценарий отказа/разрешения, не полагаясь на "выглядит правильно".
 */
describe('PolicyEvaluatorService', () => {
  function makeEvaluator(grants: PermissionGrantDocument[]): PolicyEvaluatorService {
    const mockRepository = {
      findForSubject: jest.fn().mockResolvedValue(grants),
    } as unknown as PermissionGrantRepository;
    return new PolicyEvaluatorService(mockRepository);
  }

  it('deny-by-default: subject без единого гранта получает false для любого действия', async () => {
    const evaluator = makeEvaluator([]);
    const result = await evaluator.evaluate({
      subjectType: 'position',
      subjectId: new Types.ObjectId(),
      resource: 'lead',
      action: 'read',
    });
    expect(result).toBe(false);
  });

  it('grant на другой resource не разрешает запрошенный resource', async () => {
    const evaluator = makeEvaluator([makeGrant({ resource: 'deal', action: 'read', scope: 'global' })]);
    const result = await evaluator.evaluate({
      subjectType: 'position',
      subjectId: new Types.ObjectId(),
      resource: 'lead',
      action: 'read',
    });
    expect(result).toBe(false);
  });

  it('grant на тот же resource, но другой action — не разрешает', async () => {
    const evaluator = makeEvaluator([makeGrant({ resource: 'lead', action: 'create', scope: 'global' })]);
    const result = await evaluator.evaluate({
      subjectType: 'position',
      subjectId: new Types.ObjectId(),
      resource: 'lead',
      action: 'read',
    });
    expect(result).toBe(false);
  });

  it('точное совпадение resource+action+scope:global — разрешает', async () => {
    const evaluator = makeEvaluator([makeGrant({ resource: 'lead', action: 'read', scope: 'global' })]);
    const result = await evaluator.evaluate({
      subjectType: 'position',
      subjectId: new Types.ObjectId(),
      resource: 'lead',
      action: 'read',
    });
    expect(result).toBe(true);
  });

  it('scope:city с несовпадающим scopeValue — НЕ разрешает (permission-matrix.md раздел 3)', async () => {
    const evaluator = makeEvaluator([
      makeGrant({ resource: 'listing', action: 'moderate', scope: 'city', scopeValue: 'batumi' }),
    ]);
    const result = await evaluator.evaluate({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'listing',
      action: 'moderate',
      requestedScopeValue: 'tbilisi',
    });
    expect(result).toBe(false);
  });

  it('scope:city с совпадающим scopeValue — разрешает', async () => {
    const evaluator = makeEvaluator([
      makeGrant({ resource: 'listing', action: 'moderate', scope: 'city', scopeValue: 'batumi' }),
    ]);
    const result = await evaluator.evaluate({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'listing',
      action: 'moderate',
      requestedScopeValue: 'batumi',
    });
    expect(result).toBe(true);
  });

  it('scope:global покрывает запрос без явного requestedScopeValue', async () => {
    const evaluator = makeEvaluator([makeGrant({ resource: 'export', action: 'run', scope: 'global' })]);
    const result = await evaluator.evaluate({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'export',
      action: 'run',
    });
    expect(result).toBe(true);
  });
});

describe('PolicyEvaluatorService.grant', () => {
  /**
   * Единственная точка ЗАПИСИ PermissionGrant для внешних модулей
   * (module-boundaries.test.ts запрещает импорт PermissionGrantRepository
   * напрямую из другого модуля) — AdminAccountService вызывает этот метод,
   * не repository. Проверяем только передачу параметров, self-escalation
   * prevention — ответственность вызывающего кода (AdminAccountService),
   * не этого метода (см. его комментарий).
   */
  it('передаёт параметры в PermissionGrantRepository.create без изменений', async () => {
    const createSpy = jest.fn().mockResolvedValue(undefined);
    const mockRepository = { create: createSpy } as unknown as PermissionGrantRepository;
    const evaluator = new PolicyEvaluatorService(mockRepository);
    const subjectId = new Types.ObjectId();

    await evaluator.grant({
      subjectType: 'admin_account',
      subjectId,
      resource: 'listing',
      action: 'moderate',
      scope: 'city',
      scopeValue: 'batumi',
    });

    expect(createSpy).toHaveBeenCalledWith({
      subjectType: 'admin_account',
      subjectId,
      resource: 'listing',
      action: 'moderate',
      scope: 'city',
      scopeValue: 'batumi',
    });
  });
});

describe('PolicyEvaluatorService.grantMany', () => {
  /**
   * grantDefaultRolePermissions (organizations.service.ts) — один insertMany
   * вместо N последовательных grant() (second-opinion ревью: до 21 записи
   * для owner, каждая раньше была отдельным round-trip).
   */
  it('передаёт весь массив в PermissionGrantRepository.createMany одним вызовом', async () => {
    const createManySpy = jest.fn().mockResolvedValue(undefined);
    const mockRepository = { createMany: createManySpy } as unknown as PermissionGrantRepository;
    const evaluator = new PolicyEvaluatorService(mockRepository);
    const subjectId = new Types.ObjectId();
    const items = [
      { subjectType: 'position' as const, subjectId, resource: 'development', action: 'edit', scope: 'organization' as const },
      { subjectType: 'position' as const, subjectId, resource: 'lead', action: 'assign', scope: 'organization' as const },
    ];

    await evaluator.grantMany(items);

    expect(createManySpy).toHaveBeenCalledTimes(1);
    expect(createManySpy).toHaveBeenCalledWith(items);
  });
});
