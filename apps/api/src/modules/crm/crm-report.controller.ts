import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { CrmService } from './crm.service';
import { LeadFunnelReportDto } from './dto/lead-funnel-report.dto';
import { PositionsReportDto } from './dto/positions-report.dto';

/**
 * ERP tenant-scoped CRM reporting endpoints — расширение существующего CRM-
 * модуля (тот же принцип, что CalendarEventController: отчёт по воронке/
 * позициям концептуально относится к той же tenant/CRM-области, что
 * Lead/Deal/CalendarEvent, отдельный модуль верхнего уровня не оправдан).
 *
 * Оба эндпоинта read-only (GET) — Idempotency-Key не применим, см.
 * idempotency-coverage.test.ts (маршрут не попадает в реестр не-GET команд).
 *
 * Право `crm_report.read` — новый resource, отдельный от `lead.read`/
 * `deal.read`: агрегирующий отчёт по всей организации (в том числе по
 * позициям других сотрудников) — это не то же самое действие, что чтение
 * СВОИХ/организационных лидов и сделок по отдельности, и должно выдаваться
 * осознанно тем ролям, у которых уже есть organization-wide видимость CRM
 * (owner/director/rop/developer — тот же круг, что `deal.read` scope
 * 'organization'), не всем, у кого есть `lead.read`/`deal.read` вообще
 * (manager видит `lead.read`/`deal.read` только со scope 'own').
 */
@Controller('crm/reports')
@UseGuards(TenantGuard, PermissionGuard)
export class CrmReportController {
  constructor(private readonly crmService: CrmService) {}

  @Get('lead-funnel')
  @RequirePermission('crm_report', 'read')
  async getLeadFunnel(@Req() req: FastifyRequest, @Query() dto: LeadFunnelReportDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getLeadFunnelReport({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      productType: dto.productType,
      from: dto.from ? new Date(dto.from) : undefined,
      to: dto.to ? new Date(dto.to) : undefined,
    });
  }

  @Get('positions')
  @RequirePermission('crm_report', 'read')
  async getPositionsReport(@Req() req: FastifyRequest, @Query() dto: PositionsReportDto) {
    const tenantContext = requireTenantContext(req);
    return this.crmService.getPositionsReport({
      organizationId: new Types.ObjectId(tenantContext.organizationId),
      from: dto.from ? new Date(dto.from) : undefined,
      to: dto.to ? new Date(dto.to) : undefined,
    });
  }
}
