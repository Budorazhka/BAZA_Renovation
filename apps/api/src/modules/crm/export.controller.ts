import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { OrganizationsService } from '../organizations/organizations.service';
import { buildWorkbook } from '../../shared/xlsx/build-workbook';
import { ExportService } from './export.service';
import { EXPORT_ENTITIES, exportFileName, type ExportEntity } from './export-columns';

/**
 * export.run — грант из permission-matrix.md, выданный owner/director/rop/
 * administrator/developer, но до этого коммита не проверявшийся нигде:
 * выгрузки CRM-списков просто не существовало.
 *
 * Второй (после шахматки) эндпоинт API, отдающий не JSON, и по той же
 * схеме: тело пишется прямо в FastifyReply, Content-Type и
 * Content-Disposition ставятся явно, кириллическое имя файла уходит через
 * filename* (RFC 5987).
 *
 * ВАЖНО: сам грант export.run НЕ даёт доступа к данным — ExportService
 * дополнительно требует право на чтение конкретной сущности и применяет
 * то же сужение по scope, что и соответствующий list-эндпоинт (см. его
 * докстринг). Иначе выгрузка стала бы самым удобным обходом прав: сразу
 * файлом и целиком.
 */
@Controller('exports')
@UseGuards(TenantGuard, PermissionGuard)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get(':entity')
  @RequirePermission('export', 'run')
  async runExport(
    @Req() req: FastifyRequest,
    @Param('entity') entity: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!EXPORT_ENTITIES.includes(entity as ExportEntity)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `Неизвестная сущность выгрузки: ${entity}`,
        { supported: EXPORT_ENTITIES },
      );
    }

    const tenantContext = requireTenantContext(req);
    const organizationId = new Types.ObjectId(tenantContext.organizationId);

    const { sheetName, headers, rows } = await this.exportService.buildExport({
      entity: entity as ExportEntity,
      organizationId,
      positionId: new Types.ObjectId(tenantContext.positionId),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      correlationId: req.correlationId,
    });

    const workbook = await buildWorkbook({ sheetName, headers, rows });
    const organization = await this.organizationsService.getOrganizationById(organizationId);
    const fileName = exportFileName(entity as ExportEntity, organization?.name ?? 'export', new Date());

    await reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header(
        'Content-Disposition',
        `attachment; filename="${entity}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      )
      .send(workbook);
  }
}
