import { AdminBillingPlansController } from './admin-billing-plans.controller';
import type { BillingService } from '../billing/billing.service';

/**
 * ИСПРАВЛЕНО 11.09.2026: admin-web держал свой список тарифов руками
 * (OrganizationBillingModal.tsx), дублируя DEFAULT_PLANS — этот эндпоинт
 * даёт админке читать тот же каталог, что и тенантский GET /billing/plans,
 * вместо копии. Проверяется только делегирование в BillingService.listPlans
 * — сама логика каталога/seeding уже покрыта billing.service.spec.ts.
 */
describe('AdminBillingPlansController.listPlans', () => {
  it('делегирует в BillingService.listPlans без фильтра по audience', async () => {
    const plans = [{ code: 'agency_trial' }, { code: 'developer_trial' }];
    const listPlans = jest.fn().mockResolvedValue(plans);
    const controller = new AdminBillingPlansController({ listPlans } as unknown as BillingService);

    const result = await controller.listPlans();

    expect(listPlans).toHaveBeenCalledWith();
    expect(result).toBe(plans);
  });
});
