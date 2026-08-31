import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PermissionGrantRepository } from './repository/permission-grant.repository';
import type { PermissionGrantDocument, PermissionScope, PermissionSubjectType } from './schemas/permission-grant.schema';

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
   * Query-handler использует scope не для нового разрешения, а чтобы
   * сузить уже разрешённое чтение до own/assigned. Guard по-прежнему
   * остаётся единственной точкой allow/deny; этот метод не обходит его.
   */
  async matchingScopes(request: Omit<PermissionCheckRequest, 'requestedScopeValue'>): Promise<PermissionScope[]> {
    const grants = await this.permissionGrantRepository.findForSubject(request.subjectType, request.subjectId);
    return grants
      .filter((grant) => grant.resource === request.resource && grant.action === request.action)
      .map((grant) => grant.scope);
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
   * D-06: обратная операция к evaluate() — не "разрешено ли ЭТО одно
   * действие", а "агрегируй ВСЕ grants subject'а по этому resource+action
   * в форму, годную для построения list-фильтра". Не строит Mongo-фильтр
   * сам (не знает про конкретную коллекцию/domain-модель ресурса) — тот же
   * уровень абстракции, что matchingScopes() выше, только для read-listing
   * вместо ERP query-сужения. Несколько city-grants на один resource+action
   * агрегируются в один scopeValues[] — вызывающий код сам решает, как их
   * использовать ($in одним условием, не N отдельных).
   */
  async resolveListScope(request: {
    subjectType: PermissionSubjectType;
    subjectId: Types.ObjectId;
    resource: string;
    action: string;
  }): Promise<{ global: boolean; scopeValues: string[] }> {
    const grants = await this.permissionGrantRepository.findForSubject(request.subjectType, request.subjectId);
    const matching = grants.filter((grant) => grant.resource === request.resource && grant.action === request.action);
    return {
      global: matching.some((grant) => grant.scope === 'global'),
      scopeValues: matching
        .filter((grant): grant is typeof grant & { scopeValue: string } => grant.scope === 'city' && grant.scopeValue !== undefined)
        .map((grant) => grant.scopeValue),
    };
  }

  /**
   * Admin accounts screen (apps/admin-web): просмотр текущих grants
   * аккаунта в UI требует read-доступа к полному списку, не только
   * evaluate() одного resource+action. Тот же принцип границы модуля, что
   * grant() выше — вызывающий код (AdminAccountService) не должен
   * импортировать PermissionGrantRepository напрямую.
   */
  async listGrantsForSubject(
    subjectType: PermissionSubjectType,
    subjectId: Types.ObjectId,
  ): Promise<Array<{ resource: string; action: string; scope: PermissionScope; scopeValue?: string }>> {
    const grants = await this.permissionGrantRepository.findForSubject(subjectType, subjectId);
    return grants.map((grant) => ({
      resource: grant.resource,
      action: grant.action,
      scope: grant.scope,
      scopeValue: grant.scopeValue,
    }));
  }

  /**
   * GET /admin/accounts/:id/grants (ИЗМЕНЕНО — теперь включает revoked):
   * экран "Права доступа" должен показывать полную историю grant'ов
   * аккаунта (включая уже отозванные, с revokedAt/revokedBy/revokeReason),
   * не только активное подмножество — иначе кнопка "Отозвать" не может
   * появиться/исчезнуть согласованно с реальным состоянием на сервере.
   */
  async listAllGrantsForSubject(
    subjectType: PermissionSubjectType,
    subjectId: Types.ObjectId,
  ): Promise<
    Array<{
      id: Types.ObjectId;
      resource: string;
      action: string;
      scope: PermissionScope;
      scopeValue?: string;
      version: number;
      revokedAt?: Date;
      revokedBy?: Types.ObjectId;
      revokeReason?: string;
    }>
  > {
    const grants = await this.permissionGrantRepository.findAllForSubject(subjectType, subjectId);
    return grants.map((grant) => ({
      id: grant._id,
      resource: grant.resource,
      action: grant.action,
      scope: grant.scope,
      scopeValue: grant.scopeValue,
      version: grant.version,
      revokedAt: grant.revokedAt,
      revokedBy: grant.revokedBy,
      revokeReason: grant.revokeReason,
    }));
  }

  async findGrantById(id: Types.ObjectId): Promise<PermissionGrantDocument | null> {
    return this.permissionGrantRepository.findById(id);
  }

  /**
   * Revoke — единственная точка МУТАЦИИ существующего PermissionGrant
   * (append-only: revokedAt/revokedBy/revokeReason, не physical delete),
   * тот же module-boundary принцип, что grant()/grantMany() выше —
   * AdminAccountService вызывает этот метод, не PermissionGrantRepository
   * напрямую. CAS через expectedVersion — modifiedCount:0 сигнализирует
   * вызывающему коду о конфликте (уже отозван кем-то другим или
   * expectedVersion устарел), не бросает здесь сам: разница между "не
   * найден" и "конфликт версии" — ответственность вызывающего кода
   * (AdminAccountService.revokeGrant), у которого есть adminContext для
   * audit-записи с точной причиной отказа.
   */
  async revokeGrant(
    id: Types.ObjectId,
    expectedVersion: number,
    params: { revokedBy: Types.ObjectId; reason: string },
  ): Promise<{ modifiedCount: number }> {
    return this.permissionGrantRepository.revoke(id, expectedVersion, params);
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
