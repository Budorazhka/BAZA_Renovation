import { ClientSession, Types } from 'mongoose';
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

describe('PolicyEvaluatorService.resolveListScope', () => {
  function makeEvaluator(grants: PermissionGrantDocument[]): PolicyEvaluatorService {
    const mockRepository = { findForSubject: jest.fn().mockResolvedValue(grants) } as unknown as PermissionGrantRepository;
    return new PolicyEvaluatorService(mockRepository);
  }

  it('deny-by-default: subject без единого гранта — global:false, scopeValues:[]', async () => {
    const evaluator = makeEvaluator([]);
    const result = await evaluator.resolveListScope({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'development',
      action: 'read',
    });
    expect(result).toEqual({ global: false, scopeValues: [] });
  });

  it('grant на другой resource/action не попадает в результат', async () => {
    const evaluator = makeEvaluator([
      makeGrant({ resource: 'unit', action: 'read', scope: 'global' }),
      makeGrant({ resource: 'development', action: 'unpublish', scope: 'global' }),
    ]);
    const result = await evaluator.resolveListScope({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'development',
      action: 'read',
    });
    expect(result).toEqual({ global: false, scopeValues: [] });
  });

  it('scope:global grant → global:true', async () => {
    const evaluator = makeEvaluator([makeGrant({ resource: 'development', action: 'read', scope: 'global' })]);
    const result = await evaluator.resolveListScope({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'development',
      action: 'read',
    });
    expect(result).toEqual({ global: true, scopeValues: [] });
  });

  it('несколько scope:city grants на один resource+action агрегируются в scopeValues[]', async () => {
    const evaluator = makeEvaluator([
      makeGrant({ resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' }),
      makeGrant({ resource: 'development', action: 'read', scope: 'city', scopeValue: 'tbilisi' }),
    ]);
    const result = await evaluator.resolveListScope({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'development',
      action: 'read',
    });
    expect(result).toEqual({ global: false, scopeValues: ['batumi', 'tbilisi'] });
  });

  it('scope:organization/own/team не попадает в scopeValues (только city агрегируется здесь)', async () => {
    const evaluator = makeEvaluator([makeGrant({ resource: 'development', action: 'read', scope: 'organization' })]);
    const result = await evaluator.resolveListScope({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(),
      resource: 'development',
      action: 'read',
    });
    expect(result).toEqual({ global: false, scopeValues: [] });
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

describe('PolicyEvaluatorService.listGrantsForSubject', () => {
  /**
   * admin-web accounts screen: единственный способ прочитать полный
   * список grants аккаунта без нарушения границы модуля (module-boundaries
   * запрещает импорт PermissionGrantRepository напрямую из admin-модуля).
   */
  it('возвращает grants subject в плоской форме без mongoose-обёртки документа', async () => {
    const subjectId = new Types.ObjectId();
    const mockRepository = {
      findForSubject: jest.fn().mockResolvedValue([
        makeGrant({ resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' }),
        makeGrant({ resource: 'listing', action: 'unpublish', scope: 'global' }),
      ]),
    } as unknown as PermissionGrantRepository;
    const evaluator = new PolicyEvaluatorService(mockRepository);

    const result = await evaluator.listGrantsForSubject('admin_account', subjectId);

    expect(mockRepository.findForSubject).toHaveBeenCalledWith('admin_account', subjectId);
    expect(result).toEqual([
      { resource: 'development', action: 'read', scope: 'city', scopeValue: 'batumi' },
      { resource: 'listing', action: 'unpublish', scope: 'global', scopeValue: undefined },
    ]);
  });

  it('subject без единого гранта — пустой массив', async () => {
    const mockRepository = { findForSubject: jest.fn().mockResolvedValue([]) } as unknown as PermissionGrantRepository;
    const evaluator = new PolicyEvaluatorService(mockRepository);

    const result = await evaluator.listGrantsForSubject('admin_account', new Types.ObjectId());

    expect(result).toEqual([]);
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
    // Сессия прокидывается как есть: без неё гранты писались бы вне
    // транзакции вызывающего и переживали бы её откат.
    expect(createManySpy).toHaveBeenCalledWith(items, undefined);
  });

  it('прокидывает сессию транзакции в репозиторий', async () => {
    const createManySpy = jest.fn().mockResolvedValue(undefined);
    const evaluator = new PolicyEvaluatorService({ createMany: createManySpy } as unknown as PermissionGrantRepository);
    const session = { id: 'session' } as unknown as ClientSession;

    await evaluator.grantMany([], session);

    expect(createManySpy).toHaveBeenCalledWith([], session);
  });
});

describe('PolicyEvaluatorService.revokeGrant', () => {
  it('делегирует в PermissionGrantRepository.revoke с id/expectedVersion/params без изменений', async () => {
    const revokeSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const mockRepository = { revoke: revokeSpy } as unknown as PermissionGrantRepository;
    const evaluator = new PolicyEvaluatorService(mockRepository);
    const grantId = new Types.ObjectId();
    const revokedBy = new Types.ObjectId();

    const result = await evaluator.revokeGrant(grantId, 3, { revokedBy, reason: 'причина отзыва' });

    expect(revokeSpy).toHaveBeenCalledWith(grantId, 3, { revokedBy, reason: 'причина отзыва' });
    expect(result).toEqual({ modifiedCount: 1 });
  });
});

describe('PolicyEvaluatorService.findGrantById', () => {
  it('делегирует в PermissionGrantRepository.findById', async () => {
    const grantId = new Types.ObjectId();
    const grant = makeGrant({ _id: grantId } as never);
    const findByIdSpy = jest.fn().mockResolvedValue(grant);
    const evaluator = new PolicyEvaluatorService({ findById: findByIdSpy } as unknown as PermissionGrantRepository);

    const result = await evaluator.findGrantById(grantId);

    expect(findByIdSpy).toHaveBeenCalledWith(grantId);
    expect(result).toBe(grant);
  });
});

describe('PolicyEvaluatorService.listAllGrantsForSubject', () => {
  it('включает revoked grants (в отличие от listGrantsForSubject/evaluate)', async () => {
    const subjectId = new Types.ObjectId();
    const grantId = new Types.ObjectId();
    const revokedBy = new Types.ObjectId();
    const revokedAt = new Date('2026-08-20T00:00:00.000Z');
    const findAllForSubjectSpy = jest.fn().mockResolvedValue([
      makeGrant({
        _id: grantId,
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        version: 2,
        revokedAt,
        revokedBy,
        revokeReason: 'больше не нужен доступ',
      } as never),
    ]);
    const evaluator = new PolicyEvaluatorService({ findAllForSubject: findAllForSubjectSpy } as unknown as PermissionGrantRepository);

    const result = await evaluator.listAllGrantsForSubject('admin_account', subjectId);

    expect(findAllForSubjectSpy).toHaveBeenCalledWith('admin_account', subjectId);
    expect(result).toEqual([
      {
        id: grantId,
        resource: 'development',
        action: 'read',
        scope: 'city',
        scopeValue: 'batumi',
        version: 2,
        revokedAt,
        revokedBy,
        revokeReason: 'больше не нужен доступ',
      },
    ]);
  });
});
