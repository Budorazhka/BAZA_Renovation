import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PermissionGrantRepository } from './repository/permission-grant.repository';
import type { PermissionScope, PermissionSubjectType } from './schemas/permission-grant.schema';

export interface PermissionCheckRequest {
  subjectType: PermissionSubjectType;
  subjectId: Types.ObjectId;
  resource: string;
  action: string;
  /**
   * scopeValue конкретного проверяемого ресурса — сравнивается с
   * scopeValue гранта для city/domain/project (не для own/team/organization/
   * global, где смысл scope определяется иначе, см. evaluate()).
   */
  requestedScopeValue?: string;
}

/**
 * Deny-by-default policy evaluator (ADR-002, ADR-009, permission-matrix.md).
 * Отсутствие явного grant = FORBIDDEN. Единственная точка принятия
 * authorization-решения — не дублируется ad-hoc проверками по контроллерам
 * (прямая регрессия против находки erp-functional-map.md: старый ERP-код
 * использовал минимум 3 несовместимых механизма проверки прав одновременно).
 */
@Injectable()
export class PolicyEvaluatorService {
  constructor(private readonly permissionGrantRepository: PermissionGrantRepository) {}

  /**
   * Возвращает true только если найден grant, точно соответствующий
   * resource+action, и scope гранта покрывает запрошенный scope.
   * Deny-by-default: любой путь без явного совпадения — false, не throw
   * здесь (вызывающий Guard решает, как реагировать на false — обычно
   * AppException(ErrorCode.FORBIDDEN), но сам evaluator не знает про HTTP).
   */
  async evaluate(request: PermissionCheckRequest): Promise<boolean> {
    const grants = await this.permissionGrantRepository.findForSubject(
      request.subjectType,
      request.subjectId,
    );

    return grants.some((grant) => {
      if (grant.resource !== request.resource || grant.action !== request.action) {
        return false;
      }
      return this.scopeCovers(grant.scope, grant.scopeValue, request.requestedScopeValue);
    });
  }

  /**
   * Единственная точка ЗАПИСИ PermissionGrant для внешних модулей (ADR-002
   * требование 2/architecture module-boundaries тест — repository этого
   * модуля не должен импортироваться напрямую другими модулями). AdminAccountService
   * (ADR-009: только super_admin настраивает grants) вызывает этот метод,
   * не PermissionGrantRepository напрямую — self-escalation prevention
   * остаётся ответственностью вызывающего кода (проверка isSuperAdmin), этот
   * метод сам по себе не знает про super_admin/AdminContext, только пишет
   * запись — та же граница ответственности, что evaluate() выше (тоже не
   * знает про HTTP/AdminContext, только про сам PermissionGrant).
   */
  async grant(params: {
    subjectType: PermissionSubjectType;
    subjectId: Types.ObjectId;
    resource: string;
    action: string;
    scope: PermissionScope;
    scopeValue?: string;
  }): Promise<void> {
    await this.permissionGrantRepository.create(params);
  }

  /**
   * grantDefaultRolePermissions (organizations.service.ts) — один
   * insertMany вместо N последовательных grant() (second-opinion ревью).
   */
  async grantMany(
    items: Array<{
      subjectType: PermissionSubjectType;
      subjectId: Types.ObjectId;
      resource: string;
      action: string;
      scope: PermissionScope;
      scopeValue?: string;
    }>,
  ): Promise<void> {
    await this.permissionGrantRepository.createMany(items);
  }

  /**
   * 'global' покрывает любой запрошенный scopeValue (или его отсутствие).
   * 'city'/'domain'/'project' покрывают только точное совпадение scopeValue.
   * 'own'/'position'/'team'/'organization'/'assigned' — их фактическое
   * сужение (действительно ли ресурс "свой") проверяется ВЫЗЫВАЮЩИМ кодом
   * ДО обращения к evaluate() — сюда попадает только сам факт наличия
   * права такого уровня scope, не проверка владения конкретной записью
   * (это ответственность конкретного command/query handler'а, который
   * знает domain-модель ресурса, не generic authorization-слоя).
   */
  private scopeCovers(
    grantScope: PermissionScope,
    grantScopeValue: string | undefined,
    requestedScopeValue: string | undefined,
  ): boolean {
    if (grantScope === 'global') return true;
    if (['city', 'domain', 'project'].includes(grantScope)) {
      return grantScopeValue !== undefined && grantScopeValue === requestedScopeValue;
    }
    // own/position/team/organization/assigned — наличие гранта этого уровня
    // само по себе достаточно на этом слое; точное сужение — забота caller'а.
    return true;
  }
}
