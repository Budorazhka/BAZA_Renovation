import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { LEAD_STAGE_DEFINITIONS } from './lead-stage-definitions';

/**
 * Физически отдельный controller от LeadController (тот же принцип
 * разделения, что LeadController/CrmController докстринг) — единственная
 * причина: PermissionGuard требует явный `@RequirePermission` на КАЖДОМ
 * своём маршруте (иначе бросает programming-error, см. PermissionGuard
 * докстринг), а этот эндпоинт намеренно НЕ требует специального права —
 * это статичный справочник стадий воронки по продуктам (следующий этап
 * миграции экранов ERP построит UI по нему вместо захардкоженного
 * apps/erp-web/src/data/leads-mock.ts::LEAD_STAGES), не данные лидов.
 * Достаточно валидной tenant-сессии (TenantGuard) — см. запись
 * `GET /leads/stage-definitions` в authorization-coverage.test.ts
 * INTENTIONALLY_UNAUTHORIZED.
 *
 * Зарегистрирован в CrmModule ПЕРЕД LeadController — Fastify-роутер
 * (find-my-way) сам приоритизирует статичный сегмент над параметрическим
 * (`:leadId`) независимо от порядка регистрации, но порядок оставлен явным
 * и однозначным, а не полагается молча на эту деталь реализации роутера.
 */
@Controller('leads')
@UseGuards(TenantGuard)
export class LeadStageDefinitionsController {
  @Get('stage-definitions')
  getStageDefinitions() {
    return LEAD_STAGE_DEFINITIONS;
  }
}
