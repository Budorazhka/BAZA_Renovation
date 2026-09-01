import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { AuditService } from '../audit/audit.service';
import { CrmService } from './crm.service';
import {
  EXPORT_ENTITY_READ_PERMISSION,
  EXPORT_HEADERS,
  EXPORT_SHEET_NAME,
  contactRow,
  dealRow,
  leadRow,
  taskRow,
  type ExportEntity,
} from './export-columns';
import type { XlsxCell } from '../../shared/xlsx/build-workbook';

/**
 * Потолок строк в одной выгрузке. Запрашиваем на одну больше и, если она
 * пришла, отказываем целиком вместо тихого обрезания: человек, получивший
 * файл с частью данных и не знающий об этом, примет по нему неверное
 * решение. Тот же принцип, что у выгрузки шахматки.
 */
const MAX_EXPORT_ROWS = 10_000;

@Injectable()
export class ExportService {
  constructor(
    private readonly crmService: CrmService,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * export.run — право «выгружать вообще», а НЕ право видеть данные.
   *
   * Само по себе оно не должно открывать доступ к сущностям, которые
   * человеку читать нельзя: `administrator`, например, имеет export.run,
   * но НЕ имеет deal.read (DEFAULT_ROLE_GRANTS) — если бы выгрузка
   * проверяла только export.run, она стала бы обходом прав на чтение,
   * причём самым удобным из возможных: сразу файлом и целиком.
   *
   * Поэтому здесь ВТОРАЯ проверка — на право чтения конкретной сущности,
   * и то же сужение по scope, что применяет соответствующий list-эндпоинт:
   * own-grant выгружает только своё, ровно как видит в списке.
   */
  async buildExport(params: {
    entity: ExportEntity;
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<{ sheetName: string; headers: string[]; rows: XlsxCell[][] }> {
    const permission = EXPORT_ENTITY_READ_PERMISSION[params.entity];

    const allowed = await this.policyEvaluator.evaluate({
      subjectType: 'position',
      subjectId: params.positionId,
      resource: permission.resource,
      action: permission.action,
    });
    if (!allowed) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        `Недостаточно прав: ${permission.resource}.${permission.action}`,
      );
    }

    const ownerPositionId = await this.ownerFilter(params.positionId, permission);
    const rows = await this.collectRows(params.entity, params.organizationId, ownerPositionId);

    // Выгрузка персональных данных (телефоны, email контактов) — событие,
    // которое должно остаться в истории: кто именно и что именно выгрузил.
    await this.auditService.append({
      actor: { type: 'identity', id: params.actorIdentityId },
      action: 'export.run',
      resource: 'export',
      resourceId: params.organizationId,
      after: { entity: params.entity, rowCount: rows.length, scoped: ownerPositionId !== undefined },
      correlationId: params.correlationId,
    });

    return {
      sheetName: EXPORT_SHEET_NAME[params.entity],
      headers: EXPORT_HEADERS[params.entity],
      rows,
    };
  }

  /** own/team-grant сужается до своей позиции, organization/global — нет. */
  private async ownerFilter(
    positionId: Types.ObjectId,
    permission: { resource: string; action: string },
  ): Promise<Types.ObjectId | undefined> {
    const scopes = await this.policyEvaluator.matchingScopes({
      subjectType: 'position',
      subjectId: positionId,
      resource: permission.resource,
      action: permission.action,
    });
    return scopes.some((scope) => scope === 'organization' || scope === 'global') ? undefined : positionId;
  }

  private async collectRows(
    entity: ExportEntity,
    organizationId: Types.ObjectId,
    ownerPositionId: Types.ObjectId | undefined,
  ): Promise<XlsxCell[][]> {
    // limit+1 — чтобы отличить «ровно потолок» от «больше потолка».
    const limit = MAX_EXPORT_ROWS + 1;

    switch (entity) {
      case 'leads': {
        const { items } = await this.crmService.listLeads({ organizationId, ownerPositionId, limit });
        return this.mapRows(items, leadRow);
      }
      case 'deals': {
        const { items } = await this.crmService.listDeals({ organizationId, ownerPositionId, limit });
        return this.mapRows(items, dealRow);
      }
      case 'contacts': {
        const { items } = await this.crmService.listContacts({ organizationId, ownerPositionId, limit });
        return this.mapRows(items, contactRow);
      }
      case 'tasks': {
        const { items } = await this.crmService.listTasks({
          organizationId,
          assignedPositionId: ownerPositionId,
          limit,
        });
        return this.mapRows(items, taskRow);
      }
    }
  }

  private mapRows<T>(items: T[], toRow: (item: T) => XlsxCell[]): XlsxCell[][] {
    if (items.length > MAX_EXPORT_ROWS) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        `Выгрузка ограничена ${MAX_EXPORT_ROWS} строками — сузьте выборку`,
        { limit: MAX_EXPORT_ROWS },
      );
    }
    return items.map(toRow);
  }
}
