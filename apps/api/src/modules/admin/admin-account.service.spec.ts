import { Types } from 'mongoose';
import { AdminAccountService } from './admin-account.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { AdminAccountRepository } from './repository/admin-account.repository';
import type { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import type { AuditService } from '../audit/audit.service';

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

/**
 * ADR-009 Security impact: "нет grant, дающего аккаунту право менять
 * собственные grants, кроме super_admin" — structural self-escalation
 * prevention. Эти тесты — прямая проверка того самого утверждения.
 */
describe('AdminAccountService — self-escalation prevention', () => {
  it('createAdminAccount отклоняет вызов от НЕ-super_admin как SELF_ESCALATION_BLOCKED', async () => {
    const createSpy = jest.fn();
    const service = new AdminAccountService(
      { create: createSpy } as unknown as AdminAccountRepository,
      {} as unknown as PolicyEvaluatorService,
      makeAuditService(),
    );

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
    const service = new AdminAccountService(
      { create: createSpy } as unknown as AdminAccountRepository,
      {} as unknown as PolicyEvaluatorService,
      makeAuditService(),
    );

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
    const service = new AdminAccountService(
      { findById: findByIdSpy } as unknown as AdminAccountRepository,
      { grant: grantSpy } as unknown as PolicyEvaluatorService,
      makeAuditService(),
    );

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
    const service = new AdminAccountService(
      { findById: jest.fn().mockResolvedValue(null) } as unknown as AdminAccountRepository,
      { grant: jest.fn() } as unknown as PolicyEvaluatorService,
      makeAuditService(),
    );

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
    const service = new AdminAccountService(
      { findById: jest.fn().mockResolvedValue({ _id: targetId }) } as unknown as AdminAccountRepository,
      { grant: grantSpy } as unknown as PolicyEvaluatorService,
      makeAuditService(),
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

    const service = new AdminAccountService(
      { create: jest.fn().mockResolvedValue({ _id: accountId }) } as unknown as AdminAccountRepository,
      {} as unknown as PolicyEvaluatorService,
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
    );
  });

  it('grantPermission пишет audit-событие ПОСЛЕ успешного grant, с деталями resource/action/scope', async () => {
    const targetId = new Types.ObjectId();
    const appendSpy = jest.fn().mockResolvedValue(undefined);
    const adminContext = makeAdminContext({ isSuperAdmin: true });

    const service = new AdminAccountService(
      { findById: jest.fn().mockResolvedValue({ _id: targetId }) } as unknown as AdminAccountRepository,
      { grant: jest.fn().mockResolvedValue(undefined) } as unknown as PolicyEvaluatorService,
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
    const service = new AdminAccountService(
      { findById: jest.fn().mockResolvedValue(null) } as unknown as AdminAccountRepository,
      { grant: jest.fn() } as unknown as PolicyEvaluatorService,
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
