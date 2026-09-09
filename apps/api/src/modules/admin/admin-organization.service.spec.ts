import { Types } from 'mongoose';
import { AdminOrganizationService } from './admin-organization.service';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { AdminPolicyService } from './admin-policy.service';
import type { OrganizationsService } from '../organizations/organizations.service';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

describe('AdminOrganizationService', () => {
  it('list требует право organization.read и возвращает список организаций', async () => {
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const adminListSpy = jest.fn().mockResolvedValue({
      items: [
        {
          id: new Types.ObjectId().toString(),
          name: 'Тест Девелопмент',
          type: 'developer',
          status: 'active',
          createdAt: new Date().toISOString(),
          positionsCount: 3,
        },
      ],
      nextCursor: undefined,
    });

    const service = new AdminOrganizationService(
      { adminListOrganizations: adminListSpy } as unknown as OrganizationsService,
      { requireGrant: requireGrantSpy } as unknown as AdminPolicyService,
    );

    const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 10 });

    expect(requireGrantSpy).toHaveBeenCalledWith({
      adminContext: expect.any(Object),
      resource: 'organization',
      action: 'read',
    });
    expect(adminListSpy).toHaveBeenCalledWith({ limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe('Тест Девелопмент');
  });

  it('freeze проверяет причину (min 10 символов) и право freeze', async () => {
    const orgId = new Types.ObjectId();
    const requireReasonSpy = jest.fn();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const adminFreezeSpy = jest.fn().mockResolvedValue({ id: orgId.toString(), status: 'frozen' });

    const service = new AdminOrganizationService(
      { adminFreezeOrganization: adminFreezeSpy } as unknown as OrganizationsService,
      { requireReason: requireReasonSpy, requireGrant: requireGrantSpy } as unknown as AdminPolicyService,
    );

    const context = makeAdminContext();
    const result = await service.freeze(context, {
      id: orgId,
      reason: 'Неуплата абонентской платы по договору',
      correlationId: 'req-123',
    });

    expect(requireReasonSpy).toHaveBeenCalledWith('Неуплата абонентской платы по договору');
    expect(requireGrantSpy).toHaveBeenCalledWith({
      adminContext: context,
      resource: 'organization',
      action: 'freeze',
    });
    expect(adminFreezeSpy).toHaveBeenCalledWith({
      id: orgId,
      reason: 'Неуплата абонентской платы по договору',
      actorId: new Types.ObjectId(context.adminAccountId),
      correlationId: 'req-123',
    });
    expect(result.status).toBe('frozen');
  });

  it('unfreeze проверяет причину и восстанавливает статус active', async () => {
    const orgId = new Types.ObjectId();
    const requireReasonSpy = jest.fn();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const adminUnfreezeSpy = jest.fn().mockResolvedValue({ id: orgId.toString(), status: 'active' });

    const service = new AdminOrganizationService(
      { adminUnfreezeOrganization: adminUnfreezeSpy } as unknown as OrganizationsService,
      { requireReason: requireReasonSpy, requireGrant: requireGrantSpy } as unknown as AdminPolicyService,
    );

    const context = makeAdminContext();
    const result = await service.unfreeze(context, {
      id: orgId,
      reason: 'Оплата подписки поступила в полном объёме',
    });

    expect(requireReasonSpy).toHaveBeenCalledWith('Оплата подписки поступила в полном объёме');
    expect(requireGrantSpy).toHaveBeenCalledWith({
      adminContext: context,
      resource: 'organization',
      action: 'unfreeze',
    });
    expect(adminUnfreezeSpy).toHaveBeenCalledWith({
      id: orgId,
      reason: 'Оплата подписки поступила в полном объёме',
      actorId: new Types.ObjectId(context.adminAccountId),
      correlationId: undefined,
    });
    expect(result.status).toBe('active');
  });
});
