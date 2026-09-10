import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { ClientSession, Connection, Types } from 'mongoose';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AuditService } from '../audit/audit.service';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { DEFAULT_ROLE_GRANTS, type DefaultGrant } from './default-role-grants';
import { PositionRepository } from './repository/position.repository';
import type { PositionDocument } from './schemas/position.schema';

/**
 * Позиции моложе этого создаются прямо сейчас: стартовые гранты им пишет сам
 * путь создания (createOrganizationWithOwner пишет их ПОСЛЕ коммита
 * транзакции позиции). Доливка в это окно дала бы дубли.
 */
const FRESH_POSITION_GRACE_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 200;

export interface DefaultGrantsBackfillReport {
  dryRun: boolean;
  positionsScanned: number;
  /** Позиции, которым гранты долиты (при dryRun — были бы долиты). */
  positionsUpdated: number;
  grantsAdded: number;
  /** `resource.action` → сколько позиций его получили. */
  addedByGrant: Record<string, number>;
  /** Стартовые пары, отозванные у позиции вручную: доливка их не возвращает. */
  revokedKept: number;
  skippedFresh: number;
  errors: number;
}

interface PositionGrantKeys {
  active: Set<string>;
  revoked: Set<string>;
}

function grantKey(resource: string, action: string): string {
  return `${resource}.${action}`;
}

function groupKeys(
  rows: Array<{ subjectId: Types.ObjectId; resource: string; action: string; revoked: boolean }>,
): Map<string, PositionGrantKeys> {
  const byPosition = new Map<string, PositionGrantKeys>();
  for (const row of rows) {
    const id = row.subjectId.toHexString();
    let keys = byPosition.get(id);
    if (!keys) {
      keys = { active: new Set(), revoked: new Set() };
      byPosition.set(id, keys);
    }
    (row.revoked ? keys.revoked : keys.active).add(grantKey(row.resource, row.action));
  }
  return byPosition;
}

/**
 * Какие стартовые гранты роли у позиции отсутствуют. Пара resource+action
 * считается «есть», если по ней есть ЛЮБОЙ грант — активный с любым scope или
 * отозванный:
 * - активный с другим scope (например, `lead.read` сужен до `own` вручную) не
 *   дополняется вторым: evaluate() берёт любое совпадение, второй грант
 *   расширил бы права;
 * - отозванный — решение человека (append-only revoke), не пропуск.
 */
function planForPosition(
  position: PositionDocument,
  keys: PositionGrantKeys | undefined,
): { missing: DefaultGrant[]; revokedKept: number } {
  const defaults = DEFAULT_ROLE_GRANTS[position.fixedRole] ?? [];
  let revokedKept = 0;
  const missing: DefaultGrant[] = [];
  for (const grant of defaults) {
    const key = grantKey(grant.resource, grant.action);
    if (keys?.active.has(key)) continue;
    if (keys?.revoked.has(key)) {
      revokedKept += 1;
      continue;
    }
    missing.push(grant);
  }
  return { missing, revokedKept };
}

/**
 * Доливка стартовых грантов ролей (DEFAULT_ROLE_GRANTS) в уже существующие
 * позиции.
 *
 * До 11.09.2026 набор применялся только при создании позиции, миграции не
 * было (прецедент `position.read`, см. default-role-grants.ts). Каждый новый
 * раздел (messenger, LMS, community — 10.09) означал 403 для организаций,
 * созданных раньше, и для всех, кого перенесут со старой системы до
 * появления гранта.
 *
 * Меняет только отсутствующие пары resource+action (см. planForPosition).
 * Не отзывает гранты, которых больше нет в DEFAULT_ROLE_GRANTS, и не
 * переносит смену scope: и то и другое — отдельные решения о правах, а не
 * доливка.
 *
 * Каждая позиция — своя транзакция: перечитать её гранты в снимке, долить
 * недостающие, записать аудит от системного актора. Сбой одной позиции не
 * останавливает остальные. Повторный прогон ничего не меняет.
 */
@Injectable()
export class DefaultGrantsBackfillService {
  private readonly logger = new Logger(DefaultGrantsBackfillService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly positionRepository: PositionRepository,
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly auditService: AuditService,
  ) {}

  async backfill(
    options: { dryRun?: boolean; batchSize?: number; now?: Date } = {},
  ): Promise<DefaultGrantsBackfillReport> {
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const freshAfter = new Date((options.now ?? new Date()).getTime() - FRESH_POSITION_GRACE_MS);
    const correlationId = `grants-backfill:${randomUUID()}`;
    const report: DefaultGrantsBackfillReport = {
      dryRun,
      positionsScanned: 0,
      positionsUpdated: 0,
      grantsAdded: 0,
      addedByGrant: {},
      revokedKept: 0,
      skippedFresh: 0,
      errors: 0,
    };

    let cursor: Types.ObjectId | undefined;
    for (;;) {
      const positions = await this.positionRepository.listNotClosedPage({ cursor, limit: batchSize });
      if (positions.length === 0) break;
      cursor = positions[positions.length - 1]!._id;

      const keysByPosition = groupKeys(
        await this.policyEvaluator.listGrantKeysForSubjects(
          'position',
          positions.map((position) => position._id),
        ),
      );

      for (const position of positions) {
        report.positionsScanned += 1;
        if (position.createdAt && position.createdAt > freshAfter) {
          report.skippedFresh += 1;
          continue;
        }

        const plan = planForPosition(position, keysByPosition.get(position._id.toHexString()));
        report.revokedKept += plan.revokedKept;
        if (plan.missing.length === 0) continue;

        if (dryRun) {
          this.count(report, plan.missing);
          continue;
        }

        try {
          const added = await this.applyToPosition(position, correlationId);
          if (added.length > 0) this.count(report, added);
        } catch (error) {
          report.errors += 1;
          this.logger.error(
            `Position ${position._id.toHexString()}: grants backfill failed: ${(error as Error).message}`,
          );
        }
      }

      if (positions.length < batchSize) break;
    }

    return report;
  }

  /**
   * План перечитывается в снимке транзакции: между чтением пачки и этой
   * записью позиции мог долить грант параллельный прогон или человек.
   */
  private async applyToPosition(position: PositionDocument, correlationId: string): Promise<DefaultGrant[]> {
    return runInTransaction(this.connection, async (session: ClientSession) => {
      const keys = groupKeys(
        await this.policyEvaluator.listGrantKeysForSubjects('position', [position._id], session),
      ).get(position._id.toHexString());
      const { missing } = planForPosition(position, keys);
      if (missing.length === 0) return [];

      await this.policyEvaluator.grantMany(
        missing.map((grant) => ({
          subjectType: 'position' as const,
          subjectId: position._id,
          resource: grant.resource,
          action: grant.action,
          scope: grant.scope,
        })),
        session,
      );

      await this.auditService.append(
        {
          actor: { type: 'system' },
          action: 'position.default_grants_backfill',
          resource: 'position',
          resourceId: position._id,
          reason: 'Стартовые гранты роли, появившиеся после создания позиции',
          after: {
            organizationId: position.organizationId,
            fixedRole: position.fixedRole,
            added: missing.map((grant) => `${grantKey(grant.resource, grant.action)}:${grant.scope}`),
          },
          correlationId,
        },
        session,
      );

      return missing;
    });
  }

  private count(report: DefaultGrantsBackfillReport, grants: DefaultGrant[]): void {
    report.positionsUpdated += 1;
    report.grantsAdded += grants.length;
    for (const grant of grants) {
      const key = grantKey(grant.resource, grant.action);
      report.addedByGrant[key] = (report.addedByGrant[key] ?? 0) + 1;
    }
  }
}
