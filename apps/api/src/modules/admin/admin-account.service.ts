import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import { AdminAccountRepository } from './repository/admin-account.repository';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { AuditService } from '../audit/audit.service';
import type { PermissionScope } from '../authorization/schemas/permission-grant.schema';
import type { AdminAccountDocument } from './schemas/admin-account.schema';
import { AuthService } from '../identity/auth.service';
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
  ) {}

  /**
   * Account, ProductAccess('admin') и audit — одна critical-операция. Без
   * общей транзакции можно было бы создать AdminAccount, который физически
   * не может войти в Admin (AuthService.login требует ProductAccess), либо
   * выдать доступ без audit-записи.
   */
  async createAdminAccount(
    requestedBy: AdminContext,
    params: { identityId: Types.ObjectId; isSuperAdmin: boolean; correlationId: string },
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
      return account;
    });
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

  private requireSuperAdmin(requestedBy: AdminContext): void {
    if (!requestedBy.isSuperAdmin) {
      throw new AppException(
        ErrorCode.SELF_ESCALATION_BLOCKED,
        'Только super_admin может создавать AdminAccount или настраивать grants',
      );
    }
  }
}
