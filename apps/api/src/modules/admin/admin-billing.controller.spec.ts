import { Types } from 'mongoose';
import { AdminBillingController } from './admin-billing.controller';
import type { BillingService } from '../billing/billing.service';
import type { AdminPolicyService } from './admin-policy.service';

function makeRequest(adminAccountId: Types.ObjectId) {
  return {
    adminContext: {
      identityId: new Types.ObjectId().toString(),
      adminAccountId: adminAccountId.toString(),
      isSuperAdmin: false,
    },
    correlationId: 'req-corr-billing',
  };
}

/**
 * ИСПРАВЛЕНО 11.09.2026: getOverview раньше проверял только AdminGuard
 * (валидный AdminContext) — та же дыра, что была у activate до 10.09.2026
 * (permission-matrix.md §4). Проверяется здесь вызов requireGrant с
 * правильным resource/action и что сервис не вызывается, если requireGrant
 * бросает — саму логику deny-by-default (evaluate/super_admin bypass) уже
 * покрывает admin-policy.service.spec.ts, дублировать незачем.
 */
describe('AdminBillingController.getOverview', () => {
  it('без гранта manual_ledger.read — исключение из requireGrant, сервис не вызывается', async () => {
    const adminAccountId = new Types.ObjectId();
    const getOverview = jest.fn();
    const requireGrant = jest.fn().mockRejectedValue(new Error('ADMIN_SCOPE_INSUFFICIENT'));
    const controller = new AdminBillingController(
      { adminGetBillingOverview: getOverview } as unknown as BillingService,
      { requireGrant } as unknown as AdminPolicyService,
    );

    await expect(
      controller.getOverview(makeRequest(adminAccountId) as never, new Types.ObjectId().toString()),
    ).rejects.toThrow('ADMIN_SCOPE_INSUFFICIENT');

    expect(requireGrant).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'manual_ledger', action: 'read' }),
    );
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('с грантом manual_ledger.read — сервис вызывается с organizationId из пути', async () => {
    const adminAccountId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const getOverview = jest.fn().mockResolvedValue({ plan: 'trial' });
    const requireGrant = jest.fn().mockResolvedValue(undefined);
    const controller = new AdminBillingController(
      { adminGetBillingOverview: getOverview } as unknown as BillingService,
      { requireGrant } as unknown as AdminPolicyService,
    );

    const result = await controller.getOverview(makeRequest(adminAccountId) as never, organizationId.toString());

    expect(result).toEqual({ plan: 'trial' });
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ adminAccountId: adminAccountId.toString() }),
      organizationId,
    );
  });
});
