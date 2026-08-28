import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

/** ADR-005: MarketplacePublication generic по трём sourceType. */
type PublicationSourceType = 'unit' | 'development' | 'listing';

export interface PublicationReadScope {
  global: boolean;
  cities: string[];
}

/**
 * `[technical decision — 25.08.2026]`, не owner decision: PermissionGuard
 * (authorization/permission.guard.ts) проверяет статичный resource+action,
 * заданный декоратором @RequirePermission на HTTP-методе — этого достаточно
 * для ERP-эндпоинтов, где resource известен заранее (`unit.price.update`).
 *
 * Admin critical actions (permission-matrix.md разд.4) этому не
 * соответствуют структурно: resource (`development.unpublish` vs
 * `unit.unpublish` vs `listing.unpublish`) и scopeValue (конкретный город
 * публикации) известны ТОЛЬКО после чтения целевой записи из БД — тот же
 * принцип, что уже применяется к tenant-escape проверкам ERP-стороны
 * (OrganizationsService.assignOccupant сверяет expectedOrganizationId
 * ПОСЛЕ чтения записи, не в generic guard'е). Поэтому permission-проверка
 * для Admin-действий выполняется explicit вызовом внутри service-слоя,
 * не декларативным guard'ом на контроллере — этот сервис инкапсулирует
 * общую часть (super_admin bypass + evaluate + reason-требование), чтобы
 * каждый будущий Admin critical action не дублировал эту логику заново.
 */
@Injectable()
export class AdminPolicyService {
  constructor(private readonly policyEvaluator: PolicyEvaluatorService) {}

  /**
   * super_admin (ADR-009/permission-matrix.md разд.2.1) обходит
   * PermissionGrant-проверку полностью — enforced отдельной проверкой
   * adminContext.isSuperAdmin, не через грант с scope:'global' на все
   * resource/action (иначе потребовалось бы явно перечислять сотни строк
   * при каждом новом resource, что не масштабируется).
   *
   * Обычный AdminAccount — deny-by-default через PolicyEvaluatorService,
   * тот же generic evaluator, что уже используется ERP-стороной, просто
   * с subjectType:'admin_account' вместо 'position'.
   */
  async requireGrant(params: {
    adminContext: AdminContext;
    resource: string;
    action: string;
    scopeValue?: string;
  }): Promise<void> {
    if (params.adminContext.isSuperAdmin) {
      return;
    }

    const allowed = await this.policyEvaluator.evaluate({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(params.adminContext.adminAccountId),
      resource: params.resource,
      action: params.action,
      requestedScopeValue: params.scopeValue,
    });

    if (!allowed) {
      throw new AppException(
        ErrorCode.ADMIN_SCOPE_INSUFFICIENT,
        `Недостаточно прав: ${params.resource}.${params.action}${params.scopeValue ? ` (scope: ${params.scopeValue})` : ''}`,
      );
    }
  }

  /**
   * permission-matrix.md разд.4: обязательный reason для critical actions.
   * OpenAPI-контракт (`v1-first-vertical-slice.yaml`) уже валидирует
   * `minLength:10` на уровне DTO — эта проверка избыточна для запросов,
   * прошедших class-validator, но защищает прямые вызовы service-метода
   * (будущие internal/worker-triggered admin actions, не только HTTP).
   */
  requireReason(reason: string | undefined): asserts reason is string {
    if (!reason || reason.trim().length < 10) {
      throw new AppException(ErrorCode.ADMIN_REASON_REQUIRED, 'Reason обязателен и должен содержать не менее 10 символов');
    }
  }

  /**
   * D-06: "Admin может найти publication только в разрешённом scope"
   * (мастер-план) — агрегирует read-grants admin'а по КАЖДОМУ из трёх
   * sourceType (resource=sourceType, тот же принцип резолвинга, что
   * unpublish уже использует), не по одному запрошенному. super_admin —
   * bypass, тот же принцип, что requireGrant. Возвращает 'all' вместо Map,
   * когда ограничений нет вообще — вызывающий код (buildPublicationScopeFilter)
   * не обязан отличать "супер-админ" от "обычный админ с global-грантом на
   * все три sourceType", но 'all' короче и не требует трёх evaluate-вызовов
   * для самого частого случая (super_admin).
   */
  async resolvePublicationReadScope(
    adminContext: AdminContext,
  ): Promise<Map<PublicationSourceType, PublicationReadScope> | 'all'> {
    if (adminContext.isSuperAdmin) {
      return 'all';
    }

    const sourceTypes: PublicationSourceType[] = ['development', 'unit', 'listing'];
    const result = new Map<PublicationSourceType, PublicationReadScope>();

    for (const sourceType of sourceTypes) {
      const scope = await this.policyEvaluator.resolveListScope({
        subjectType: 'admin_account',
        subjectId: new Types.ObjectId(adminContext.adminAccountId),
        resource: sourceType,
        action: 'read',
      });
      if (scope.global || scope.scopeValues.length > 0) {
        result.set(sourceType, { global: scope.global, cities: scope.scopeValues });
      }
    }

    return result;
  }
}
