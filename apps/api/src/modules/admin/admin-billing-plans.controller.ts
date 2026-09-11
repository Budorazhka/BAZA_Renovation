import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../shared/admin/admin.guard';
import { BillingService } from '../billing/billing.service';

/**
 * ИСПРАВЛЕНО 11.09.2026: apps/admin-web/src/components/OrganizationBillingModal.tsx
 * держал свой список тарифов (`AVAILABLE_PLANS`) руками — дублировал
 * DEFAULT_PLANS из billing.service.ts и неизбежно разошёлся бы с ним при
 * следующем изменении каталога. Тенантский `GET /billing/plans` тут не
 * подходит — он защищён `TenantGuard` (organizationId/positionId), а у
 * admin-сессии их нет вовсе (другая модель аутентификации, AdminContext).
 * Каталог планов — не organizationId-специфичные данные и не финансовая
 * история конкретной организации (в отличие от `manual_ledger.*`), поэтому
 * здесь только `AdminGuard` — тот же уровень доступа, что у тенантского
 * эндпоинта (любой сотрудник организации его видит без отдельного гранта).
 */
@Controller('admin/billing/plans')
@UseGuards(AdminGuard)
export class AdminBillingPlansController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  async listPlans() {
    return this.billingService.listPlans();
  }
}
