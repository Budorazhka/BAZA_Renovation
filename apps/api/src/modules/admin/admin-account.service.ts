import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import { AdminAccountRepository } from './repository/admin-account.repository';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService, type IdempotentReplay } from '../../shared/idempotency/idempotency.service';
import type { PermissionScope } from '../authorization/schemas/permission-grant.schema';
import type { AdminAccountDocument } from './schemas/admin-account.schema';
import { AuthService } from '../identity/auth.service';
import { SessionService } from '../identity/session.service';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';

/**
 * ADR-009: "Только super_admin создаёт AdminAccount и настраивает доступы"
 * (owner decision #133) — императивное правило, не только UI-ограничение.
 * Проверка isSuperAdmin здесь, ВНУТРИ сервиса, не только на controller —
 * ADR-009 Security impact прямо требует structural prevention self-
 * escalation: "нет grant, дающего аккаунту право менять собственные grants,
 * кроме super_admin" — если бы проверка жила только в controller-guard'е,
 * пропущенный guard на будущем втором controller-методе стал бы реальной
 * дырой эскалации привилегий, не поймаемой на этом уровне защиты.
 */
@Injectable()
export class AdminAccountService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly adminAccountRepository: AdminAccountRepository,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Account, ProductAccess('admin') и audit — одна critical-операция. Без
   * общей транзакции можно было бы создать AdminAccount, который физически
   * не может войти в Admin (AuthService.login требует ProductAccess), либо
   * выдать доступ без audit-записи.
   */
  async createAdminAccount(
    requestedBy: AdminContext,
    params: {
      identityId: Types.ObjectId;
      isSuperAdmin: boolean;
      correlationId: string;
      /** ADR-006: повтор не должен создавать второй админ-аккаунт. */
      idempotency: { actorIdentityId: Types.ObjectId; key: string; requestBody: Record<string, unknown> };
    },
  ): Promise<AdminAccountDocument> {
    this.requireSuperAdmin(requestedBy);
    return runInTransaction(this.connection, async (session) => {
      const account = await this.adminAccountRepository.create(
        { identityId: params.identityId, isSuperAdmin: params.isSuperAdmin },
        session,
      );
      await this.authService.grantAdminAccess(params.identityId, session);
      await this.auditService.append(
        {
          actor: { type: 'admin_account', id: new Types.ObjectId(requestedBy.adminAccountId) },
          action: 'admin_account.create',
          resource: 'admin_account',
          resourceId: account._id,
          after: { identityId: params.identityId.toString(), isSuperAdmin: params.isSuperAdmin },
          correlationId: params.correlationId,
        },
        session,
      );
      // ADR-006: отметка идемпотентности пишется в ТОЙ ЖЕ транзакции, что и
      // аккаунт с его грантом доступа и audit-записью.
      await this.idempotencyService.record(
        {
          identityId: params.idempotency.actorIdentityId,
          operation: 'createAdminAccount',
          key: params.idempotency.key,
          requestBody: params.idempotency.requestBody,
          responseStatus: 201,
          responseBody: {
            id: account._id.toString(),
            identityId: account.identityId.toString(),
            isSuperAdmin: account.isSuperAdmin,
          },
        },
        session,
      );

      return account;
    });
  }

  /** Проверка повтора до транзакции — как в property-assets и developments. */
  checkCreateReplay(
    identityId: Types.ObjectId,
    key: string,
    requestBody: Record<string, unknown>,
  ): Promise<IdempotentReplay | null> {
    return this.idempotencyService.checkReplay({ identityId, operation: 'createAdminAccount', key, requestBody });
  }

  /**
   * Grants настраиваются ИНДИВИДУАЛЬНО (ADR-009: "не привязанным к
   * фиксированному списку hardcoded ролей") — один grant за вызов, не
   * bulk-замена всего набора, чтобы каждое изменение было отдельным явным
   * действием. audit-запись per-grant (ДОБАВЛЕНО 26.08.2026) — тот же
   * принцип, что createAdminAccount выше.
   */
  async grantPermission(
    requestedBy: AdminContext,
    params: {
      adminAccountId: Types.ObjectId;
      resource: string;
      action: string;
      scope: PermissionScope;
      scopeValue?: string;
      correlationId: string;
    },
  ): Promise<void> {
    this.requireSuperAdmin(requestedBy);

    const target = await this.adminAccountRepository.findById(params.adminAccountId);
    if (!target) {
      throw new AppException(ErrorCode.NOT_FOUND, 'AdminAccount not found');
    }

    await this.policyEvaluator.grant({
      subjectType: 'admin_account',
      subjectId: params.adminAccountId,
      resource: params.resource,
      action: params.action,
      scope: params.scope,
      scopeValue: params.scopeValue,
    });

    await this.auditService.append({
      actor: { type: 'admin_account', id: new Types.ObjectId(requestedBy.adminAccountId) },
      action: 'admin_account.grant_permission',
      resource: 'admin_account',
      resourceId: params.adminAccountId,
      after: {
        resource: params.resource,
        action: params.action,
        scope: params.scope,
        scopeValue: params.scopeValue,
      },
      correlationId: params.correlationId,
    });
  }

  /**
   * GET /admin/accounts (admin-web "manage admin accounts" screen) —
   * super_admin-only, тот же self-escalation принцип, что create/grant
   * выше: обычный scoped admin не должен уметь перечислить весь состав
   * админов (ADR-009 — Admin accounts management целиком в руках
   * super_admin, не отдельное read-право).
   */
  async listAdminAccounts(
    requestedBy: AdminContext,
    params: { cursor?: Types.ObjectId; limit: number },
  ): Promise<Array<{ id: Types.ObjectId; identityId: Types.ObjectId; isSuperAdmin: boolean; status: string; createdAt: Date }>> {
    this.requireSuperAdmin(requestedBy);
    const rows = await this.adminAccountRepository.list(params);
    return rows.map((row) => ({
      id: row._id,
      identityId: row.identityId,
      isSuperAdmin: row.isSuperAdmin,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  /**
   * super_admin-only, транзакционная: status→'deactivated' + отзыв всех
   * admin-audience сессий этой identity + audit — одна атомарная операция
   * (та же ADR-006 логика, что createAdminAccount выше). Без общей
   * транзакции можно было бы деактивировать аккаунт, но забыть отозвать
   * сессию (старый cookie продолжал бы пускать до истечения TTL), либо
   * отозвать сессию без audit-следа причины.
   *
   * Инварианты (в этом порядке — self-deactivation проверяется раньше
   * last-super-admin, чтобы попытка "деактивировать себя, будучи
   * единственным super_admin" всегда возвращала один и тот же понятный код,
   * не зависела от порядка проверок):
   *  - self-deactivation запрещена полностью (owner decision после явного
   *    уточнения задачи) — super_admin не может деактивировать сам себя ни
   *    при каких обстоятельствах, только другой super_admin может это
   *    сделать. Отдельный явный код ADMIN_SELF_DEACTIVATION_BLOCKED, не
   *    generic FORBIDDEN — тот же принцип, что SELF_ESCALATION_BLOCKED
   *    (клиент должен уметь показать точную причину отказа для ЭТОГО
   *    конкретного действия, не общий "нет доступа").
   *  - последний активный super_admin не может быть деактивирован НИКЕМ
   *    (даже другим super_admin) — система не должна лишиться единственного
   *    аккаунта, способного управлять составом админов/grants.
   *  - идемпотентно: аккаунт уже в статусе 'deactivated' — no-op, второй
   *    вызов не бросает и не пишет повторный audit (не "конфликт", target
   *    и без того уже в желаемом состоянии — тот же принцип, что
   *    IdentityRepository.updateStatus дальше по коду, condition в фильтре
   *    просто не находит совпадения).
   */
  async deactivateAdminAccount(
    requestedBy: AdminContext,
    params: { adminAccountId: Types.ObjectId; reason: string; correlationId: string },
  ): Promise<{ status: 'active' | 'deactivated' }> {
    this.requireSuperAdmin(requestedBy);

    if (params.adminAccountId.toString() === requestedBy.adminAccountId) {
      throw new AppException(
        ErrorCode.ADMIN_SELF_DEACTIVATION_BLOCKED,
        'Нельзя деактивировать собственный admin-аккаунт — попросите другого super_admin',
      );
    }

    const target = await this.adminAccountRepository.findById(params.adminAccountId);
    if (!target) {
      throw new AppException(ErrorCode.NOT_FOUND, 'AdminAccount not found');
    }

    if (target.status === 'deactivated') {
      return { status: 'deactivated' };
    }

    return runInTransaction(this.connection, async (session) => {
      if (target.isSuperAdmin) {
        const activeSuperAdmins = await this.adminAccountRepository.countActiveSuperAdmins(session);
        if (activeSuperAdmins <= 1) {
          throw new AppException(
            ErrorCode.ADMIN_LAST_SUPER_ADMIN,
            'Нельзя деактивировать последнего активного super_admin',
          );
        }
      }

      const { modifiedCount } = await this.adminAccountRepository.updateStatus(
        params.adminAccountId,
        { from: 'active', to: 'deactivated' },
        session,
      );
      if (modifiedCount === 0) {
        // Гонка: кто-то другой уже деактивировал этот же аккаунт в
        // конкурентной транзакции между findById выше и этим updateOne —
        // тот же итоговый статус, к которому стремился этот вызов, поэтому
        // трактуем как уже достигнутую цель, не как ошибку.
        return { status: 'deactivated' as const };
      }

      await this.sessionService.revokeAllAdminSessions(target.identityId);

      await this.auditService.append(
        {
          actor: { type: 'admin_account', id: new Types.ObjectId(requestedBy.adminAccountId) },
          action: 'admin_account.deactivate',
          resource: 'admin_account',
          resourceId: params.adminAccountId,
          reason: params.reason,
          before: { status: 'active' },
          after: { status: 'deactivated' },
          correlationId: params.correlationId,
        },
        session,
      );

      return { status: 'deactivated' as const };
    });
  }

  /**
   * Симметрично deactivateAdminAccount, без last-super-admin/self-
   * deactivation инвариантов (реактивация расширяет доступ обратно к уже
   * существовавшему состоянию, не создаёт новый риск, которого не было бы
   * до деактивации) — но с тем же transactional audit-паттерном. Не
   * восстанавливает сессии, отозванные при деактивации (та же семантика,
   * что AuthService.reactivateIdentity — человек логинится заново, не
   * получает обратно старый cookie).
   */
  async reactivateAdminAccount(
    requestedBy: AdminContext,
    params: { adminAccountId: Types.ObjectId; reason: string; correlationId: string },
  ): Promise<{ status: 'active' | 'deactivated' }> {
    this.requireSuperAdmin(requestedBy);

    const target = await this.adminAccountRepository.findById(params.adminAccountId);
    if (!target) {
      throw new AppException(ErrorCode.NOT_FOUND, 'AdminAccount not found');
    }

    if (target.status === 'active') {
      return { status: 'active' };
    }

    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.adminAccountRepository.updateStatus(
        params.adminAccountId,
        { from: 'deactivated', to: 'active' },
        session,
      );
      if (modifiedCount === 0) {
        return { status: 'active' as const };
      }

      await this.auditService.append(
        {
          actor: { type: 'admin_account', id: new Types.ObjectId(requestedBy.adminAccountId) },
          action: 'admin_account.reactivate',
          resource: 'admin_account',
          resourceId: params.adminAccountId,
          reason: params.reason,
          before: { status: 'deactivated' },
          after: { status: 'active' },
          correlationId: params.correlationId,
        },
        session,
      );

      return { status: 'active' as const };
    });
  }

  /**
   * GET /admin/accounts/:id/grants (ИЗМЕНЕНО — теперь включает revoked
   * grants, см. PolicyEvaluatorService.listAllGrantsForSubject) — UI должен
   * видеть полную историю, не только активное подмножество, чтобы кнопка
   * "Отозвать" корректно скрывалась для уже отозванных записей.
   */
  async listGrants(
    requestedBy: AdminContext,
    adminAccountId: Types.ObjectId,
  ): Promise<
    Array<{
      id: string;
      resource: string;
      action: string;
      scope: PermissionScope;
      scopeValue?: string;
      version: number;
      revokedAt?: string;
      revokedBy?: string;
      revokeReason?: string;
    }>
  > {
    this.requireSuperAdmin(requestedBy);
    const target = await this.adminAccountRepository.findById(adminAccountId);
    if (!target) {
      throw new AppException(ErrorCode.NOT_FOUND, 'AdminAccount not found');
    }
    const grants = await this.policyEvaluator.listAllGrantsForSubject('admin_account', adminAccountId);
    return grants.map((grant) => ({
      id: grant.id.toString(),
      resource: grant.resource,
      action: grant.action,
      scope: grant.scope,
      scopeValue: grant.scopeValue,
      version: grant.version,
      revokedAt: grant.revokedAt?.toISOString(),
      revokedBy: grant.revokedBy?.toString(),
      revokeReason: grant.revokeReason,
    }));
  }

  /**
   * super_admin-only. Не удаляет запись физически (PolicyEvaluatorService.
   * revokeGrant — append-only, ставит revokedAt/revokedBy/revokeReason).
   * CAS через expectedVersion — конфликт (modifiedCount:0 при grant всё ещё
   * существующем и невыданном) означает "кто-то уже отозвал этот же grant
   * между вашим чтением списка и этим вызовом", возвращается как
   * VERSION_CONFLICT, не тихо игнорируется и не трактуется как успех (в
   * отличие от deactivate/reactivate выше, где повторный вызов на тот же
   * target идемпотентен по dизайну — здесь версия защищает от двух РАЗНЫХ
   * решений об отзыве, конкурирующих за одну и ту же запись, поэтому
   * "уже отозвано" — честный конфликт, не эквивалентный результат).
   *
   * Чужой grant не раскрывается отдельно: NOT_FOUND и для "аккаунта не
   * существует", и для "grant не принадлежит этому adminAccountId" — тот
   * же non-disclosure принцип, что listGrants/grantPermission выше.
   */
  async revokeGrant(
    requestedBy: AdminContext,
    params: { adminAccountId: Types.ObjectId; grantId: Types.ObjectId; expectedVersion: number; reason: string; correlationId: string },
  ): Promise<void> {
    this.requireSuperAdmin(requestedBy);

    const target = await this.adminAccountRepository.findById(params.adminAccountId);
    if (!target) {
      throw new AppException(ErrorCode.NOT_FOUND, 'AdminAccount not found');
    }

    const grant = await this.policyEvaluator.findGrantById(params.grantId);
    if (!grant || grant.subjectType !== 'admin_account' || !grant.subjectId.equals(params.adminAccountId)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'PermissionGrant not found');
    }

    if (grant.revokedAt) {
      throw new AppException(ErrorCode.VERSION_CONFLICT, 'Этот grant уже отозван');
    }

    const { modifiedCount } = await this.policyEvaluator.revokeGrant(params.grantId, params.expectedVersion, {
      revokedBy: new Types.ObjectId(requestedBy.adminAccountId),
      reason: params.reason,
    });

    if (modifiedCount === 0) {
      throw new AppException(
        ErrorCode.VERSION_CONFLICT,
        'Grant изменён другим запросом — обновите список и попробуйте снова',
      );
    }

    await this.auditService.append({
      actor: { type: 'admin_account', id: new Types.ObjectId(requestedBy.adminAccountId) },
      action: 'admin_account.revoke_permission',
      resource: 'admin_account',
      resourceId: params.adminAccountId,
      reason: params.reason,
      before: { resource: grant.resource, action: grant.action, scope: grant.scope, scopeValue: grant.scopeValue },
      after: { revoked: true },
      correlationId: params.correlationId,
    });
  }

  private requireSuperAdmin(requestedBy: AdminContext): void {
    if (!requestedBy.isSuperAdmin) {
      throw new AppException(
        ErrorCode.SELF_ESCALATION_BLOCKED,
        'Только super_admin может создавать AdminAccount или настраивать grants',
      );
    }
  }
}
