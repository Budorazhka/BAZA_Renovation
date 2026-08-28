import { Types } from 'mongoose';
import { AdminAccountService } from './admin-account.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { AdminAccountRepository } from './repository/admin-account.repository';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthService } from '../identity/auth.service';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeAuditService(overrides: Partial<AuditService> = {}): AuditService {
  return { append: jest.fn().mockResolvedValue(undefined), ...overrides } as unknown as AuditService;
}

function makeTransactionConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeService(
  repository: Partial<AdminAccountRepository> = {},
  policyEvaluator: Partial<PolicyEvaluatorService> = {},
  auditService: AuditService = makeAuditService(),
  authService: Partial<AuthService> = { grantAdminAccess: jest.fn().mockResolvedValue(undefined) },
): AdminAccountService {
  return new AdminAccountService(
    makeTransactionConnection() as never,
    repository as AdminAccountRepository,
    policyEvaluator as PolicyEvaluatorService,
    auditService,
    authService as AuthService,
  );
}

/**
 * ADR-009 Security impact: "нет grant, дающего аккаунту право менять
 * собственные grants, кроме super_admin" — structural self-escalation
 * prevention. Эти тесты — прямая проверка того самого утверждения.
 */
describe('AdminAccountService — self-escalation prevention', () => {
  it('createAdminAccount отклоняет вызов от НЕ-super_admin как SELF_ESCALATION_BLOCKED', async () => {
    const createSpy = jest.fn();
    const service = makeService({ create: createSpy });

    await expect(
      service.createAdminAccount(makeAdminContext({ isSuperAdmin: false }), {
        identityId: new Types.ObjectId(),
        isSuperAdmin: false,
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toMatchObject(expect.objectContaining({ code: ErrorCode.SELF_ESCALATION_BLOCKED }));

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('createAdminAccount проходит для super_admin', async () => {
    const createSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const service = makeService({ create: createSpy });

    await service.createAdminAccount(makeAdminContext({ isSuperAdmin: true }), {
      identityId: new Types.ObjectId(),
      isSuperAdmin: false,
      correlationId: 'test-correlation-id',
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('grantPermission отклоняет вызов от НЕ-super_admin как SELF_ESCALATION_BLOCKED, не читает target', async () => {
    const findByIdSpy = jest.fn();
    const grantSpy = jest.fn();
    const service = makeService({ findById: findByIdSpy }, { grant: grantSpy });

    await expect(
      service.grantPermission(makeAdminContext({ isSuperAdmin: false }), {
        adminAccountId: new Types.ObjectId(),
        resource: 'admin_account',
        action: 'manage',
        scope: 'global',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toMatchObject(expect.objectContaining({ code: ErrorCode.SELF_ESCALATION_BLOCKED }));

    expect(findByIdSpy).not.toHaveBeenCalled();
    expect(grantSpy).not.toHaveBeenCalled();
  });

  it('grantPermission от super_admin бросает NOT_FOUND, если target AdminAccount не существует', async () => {
    const service = makeService({ findById: jest.fn().mockResolvedValue(null) }, { grant: jest.fn() });

    await expect(
      service.grantPermission(makeAdminContext({ isSuperAdmin: true }), {
        adminAccountId: new Types.ObjectId(),
        resource: 'listing',
        action: 'moderate',
        scope: 'city',
        scopeValue: 'batumi',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toMatchObject(expect.objectContaining({ code: ErrorCode.NOT_FOUND }));
  });

  it('grantPermission от super_admin создаёт грант с subjectType:admin_account для существующего target', async () => {
    const targetId = new Types.ObjectId();
    const grantSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService(
      { findById: jest.fn().mockResolvedValue({ _id: targetId }) },
      { grant: grantSpy },
    );

    await service.grantPermission(makeAdminContext({ isSuperAdmin: true }), {
      adminAccountId: targetId,
      resource: 'listing',
      action: 'moderate',
      scope: 'city',
      scopeValue: 'batumi',
      correlationId: 'test-correlation-id',
    });

    expect(grantSpy).toHaveBeenCalledWith({
      subjectType: 'admin_account',
      subjectId: targetId,
      resource: 'listing',
      action: 'moderate',
      scope: 'city',
      scopeValue: 'batumi',
    });
  });
});

/**
 * honest gap закрыт 26.08.2026 — permission-matrix.md разд.4 ("изменения
 * статуса/прав/блокировок" в scope audit-требования), d06-admin-operation.md
 * ранее фиксировал отсутствие audit здесь явно.
 */
describe('AdminAccountService — audit', () => {
  it('createAdminAccount пишет audit-событие с actor:admin_account и созданным identityId', async () => {
    const accountId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const appendSpy = jest.fn().mockResolvedValue(undefined);
    const adminContext = makeAdminContext({ isSuperAdmin: true });

    const service = makeService(
      { create: jest.fn().mockResolvedValue({ _id: accountId }) },
      {},
      makeAuditService({ append: appendSpy }),
    );

    await service.createAdminAccount(adminContext, {
      identityId,
      isSuperAdmin: false,
      correlationId: 'test-correlation-id',
    });

    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'admin_account', id: new Types.ObjectId(adminContext.adminAccountId) },
        action: 'admin_account.create',
        resource: 'admin_account',
        resourceId: accountId,
        correlationId: 'test-correlation-id',
      }),
      expect.anything(),
    );
  });

  it('grantPermission пишет audit-событие ПОСЛЕ успешного grant, с деталями resource/action/scope', async () => {
    const targetId = new Types.ObjectId();
    const appendSpy = jest.fn().mockResolvedValue(undefined);
    const adminContext = makeAdminContext({ isSuperAdmin: true });

    const service = makeService(
      { findById: jest.fn().mockResolvedValue({ _id: targetId }) },
      { grant: jest.fn().mockResolvedValue(undefined) },
      makeAuditService({ append: appendSpy }),
    );

    await service.grantPermission(adminContext, {
      adminAccountId: targetId,
      resource: 'listing',
      action: 'moderate',
      scope: 'city',
      scopeValue: 'batumi',
      correlationId: 'test-correlation-id',
    });

    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'admin_account', id: new Types.ObjectId(adminContext.adminAccountId) },
        action: 'admin_account.grant_permission',
        resource: 'admin_account',
        resourceId: targetId,
        after: { resource: 'listing', action: 'moderate', scope: 'city', scopeValue: 'batumi' },
        correlationId: 'test-correlation-id',
      }),
    );
  });

  it('grantPermission НЕ пишет audit, если target не найден (отклонено до grant)', async () => {
    const appendSpy = jest.fn();
    const service = makeService(
      { findById: jest.fn().mockResolvedValue(null) },
      { grant: jest.fn() },
      makeAuditService({ append: appendSpy }),
    );

    await expect(
      service.grantPermission(makeAdminContext({ isSuperAdmin: true }), {
        adminAccountId: new Types.ObjectId(),
        resource: 'listing',
        action: 'moderate',
        scope: 'global',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow();

    expect(appendSpy).not.toHaveBeenCalled();
  });
});

/**
 * AdminAccount без ProductAccess('admin') существует в базе, но его
 * identity не может пройти AuthService.login с audience:'admin'. Это не
 * UI-деталь: AuthService намеренно проверяет product_accesses до выдачи
 * admin-сессии. Создание аккаунта обязано выдавать оба доступа как одну
 * бизнес-операцию.
 */
describe('AdminAccountService — product access', () => {
  it('при создании AdminAccount выдаёт identity доступ к продукту admin', async () => {
    const accountId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const grantAdminAccess = jest.fn().mockResolvedValue(undefined);
    const service = makeService(
      { create: jest.fn().mockResolvedValue({ _id: accountId }) },
      {},
      makeAuditService(),
      { grantAdminAccess },
    );

    await service.createAdminAccount(makeAdminContext({ isSuperAdmin: true }), {
      identityId,
      isSuperAdmin: false,
      correlationId: 'test-correlation-id',
    });

    expect(grantAdminAccess).toHaveBeenCalledWith(identityId, expect.anything());
  });
});
