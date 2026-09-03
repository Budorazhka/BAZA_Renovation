import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { ContactRepository } from './repository/contact.repository';
import { LeadRepository } from './repository/lead.repository';
import { LeadEventRepository } from './repository/lead-event.repository';
import type { LeadEventChangedBy } from './schemas/lead-event.schema';
import type { LeadProductType, LeadStage, RealtorStage, CuratorStage } from './schemas/lead.schema';
import { PRODUCT_TYPES, ProductType } from './lead-stage-definitions';
import { REALTOR_STAGE_VALUES, CURATOR_STAGE_VALUES } from './lead-stage';
import { translateLegacyStage, LegacyLeadValidationError } from './lead-stage-legacy-mapping';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import type { LegacyLead } from './legacy-lead.types';

export interface LeadMigrationRowError {
  legacyId: string;
  message: string;
}

/**
 * Незлобные (не роняющие лид) факты, которые оператор миграции обязан
 * увидеть — сейчас единственный источник: `assignedTo`/`history[].changedBy`
 * без соответствия в `managerMapping` (owner decision — не резолвится
 * автоматически, см. LeadMigrationService.importLegacyLeads докстринг).
 * Отдельно от `errors`: лид при этом успешно создаётся/обновляется, это не
 * failure этой строки.
 */
export interface LeadMigrationRowWarning {
  legacyId: string;
  message: string;
}

export interface LeadMigrationReport {
  total: number;
  created: number;
  updated: number;
  /**
   * Зарезервировано форматом отчёта — текущая реализация не производит эту
   * категорию: каждая строка входного файла заканчивается либо `created`,
   * либо `updated`, либо записью в `errors` (см. честные пробелы в докстринге
   * `importLegacyLeads`).
   */
  skipped: number;
  errors: LeadMigrationRowError[];
  warnings: LeadMigrationRowWarning[];
}

export interface ImportLegacyLeadsParams {
  organizationId: Types.ObjectId;
  leads: LegacyLead[];
  /** legacyAccountId (легаси, `assignedTo`/`history[].changedBy`) → positionId нового backend (строка ObjectId). */
  managerMapping: Record<string, string>;
  /** Системный актор для `LeadEvent.changedBy`, когда `history[].changedBy` не резолвится через managerMapping. */
  defaultActorIdentityId: Types.ObjectId;
  /** Прогон без записи в базу — та же валидация и тот же отчёт, без побочных эффектов. */
  dryRun?: boolean;
}

type ImportOutcome = 'created' | 'updated';

/**
 * `[lead-legacy-migration-tool]`: перенос лидов с легаси-backend
 * (`api-crm.baza.sale`) в новый (`apps/api`), минуя HTTP — источник данных
 * ТОЛЬКО уже выгруженный JSON-файл (легаси-формат `Lead`/`LeadHistory`,
 * `legacy-lead.types.ts`), не сам легаси-backend (см. migrate-legacy-leads.
 * command.ts докстринг за причиной).
 *
 * ПОЧЕМУ НЕ ЧЕРЕЗ `CrmService.createLead`/`changeLeadStage`: оба безусловно
 * проставляют `createdAt`/`changedAt` текущим моментом (Mongoose timestamps)
 * — перенос обязан сохранить НАСТОЯЩУЮ историческую дату, иначе CRM теряет
 * реальную хронологию активности по перенесённым лидам. Экспериментально
 * подтверждено (lead-migration-timestamps.integration-spec.ts): явно
 * переданный `createdAt`/`changedAt` НЕ перезаписывается Mongoose при
 * `Model.create()` — LeadRepository.createFromMigration/LeadEventRepository.
 * append(changedAt) передают его напрямую, без пост-создания `updateOne`.
 *
 * ИДЕМПОТЕНТНОСТЬ: `LeadDocument.legacyId` (unique sparse на
 * `{organizationId, legacyId}`) — повторный прогон на том же файле находит
 * уже созданный лид по этому ключу и обновляет сопутствующие поля
 * (`updateFields`, тот же путь, что PATCH /leads/:leadId), не создаёт
 * дубль. История (`LeadEvent`) пишется ТОЛЬКО при первом создании лида —
 * append-only коллекция не имеет update/delete (см. её докстринг), повторный
 * прогон переписал бы её тем же содержимым, что уже есть — не полезная
 * операция, только риск задвоить историю; если легаси-лид накопил НОВУЮ
 * историю после первого переноса, это отдельный будущий сценарий
 * ("дозагрузка"), вне контракта этого прохода.
 *
 * АТОМАРНОСТЬ: одна транзакция на лид (не на весь файл) — кривые данные
 * одной строки не должны откатывать уже успешно перенесённые. Тот же
 * принцип, что построчный CSV-импорт (`lead-import.service.ts`).
 *
 * ЧЕСТНЫЕ ПРОБЕЛЫ (не переносится, потому что не запрошено/не нужно):
 *  - `files`/`roles`/`aiSummary` легаси Lead — вне контракта переноса.
 *  - `history[].fromStage`/`userName`/`userRole` — не пишутся: `LeadEvent`
 *    хранит только результирующую `stage` перехода (тот же формат, что
 *    CrmService.changeLeadStage уже использует), `userName`/`userRole` —
 *    производные читаемые поля легаси-фронтенда, не часть домена.
 *  - Повторная миграция НЕ дозагружает новые записи `history[]`, появившиеся
 *    в легаси после первого переноса лида (см. ИДЕМПОТЕНТНОСТЬ выше).
 */
@Injectable()
export class LeadMigrationService {
  private readonly logger = new Logger(LeadMigrationService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly contactRepository: ContactRepository,
    private readonly leadRepository: LeadRepository,
    private readonly leadEventRepository: LeadEventRepository,
  ) {}

  async importLegacyLeads(params: ImportLegacyLeadsParams): Promise<LeadMigrationReport> {
    const report: LeadMigrationReport = {
      total: params.leads.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      warnings: [],
    };

    for (const legacyLead of params.leads) {
      try {
        const outcome = await this.importOneLead(params, legacyLead, report.warnings);
        if (outcome === 'created') {
          report.created += 1;
        } else {
          report.updated += 1;
        }
      } catch (error) {
        this.logger.warn(`Лид legacyId=${legacyLead._id} не перенесён: ${errorMessage(error)}`);
        report.errors.push({ legacyId: legacyLead._id, message: errorMessage(error) });
      }
    }

    return report;
  }

  private async importOneLead(
    params: ImportLegacyLeadsParams,
    legacyLead: LegacyLead,
    warnings: LeadMigrationRowWarning[],
  ): Promise<ImportOutcome> {
    const productType = validateProductType(legacyLead.productType);
    const stage = translateLegacyStage(legacyLead.stage, productType) as LeadStage;
    const realtorStage = legacyLead.realtorStage
      ? (validateEnumValue(legacyLead.realtorStage, REALTOR_STAGE_VALUES, 'realtorStage') as RealtorStage)
      : undefined;
    const curatorStage = legacyLead.curatorStage
      ? (validateEnumValue(legacyLead.curatorStage, CURATOR_STAGE_VALUES, 'curatorStage') as CuratorStage)
      : undefined;

    const ownerPositionId = resolvePositionId(legacyLead.assignedTo, params.managerMapping);
    if (legacyLead.assignedTo && !ownerPositionId) {
      warnings.push({
        legacyId: legacyLead._id,
        message: 'не назначен, нет в managerMapping',
      });
    }

    const historyEvents = legacyLead.history.map((entry) => ({
      stage: translateLegacyStage(entry.toStage, productType) as LeadStage,
      changedAt: new Date(entry.changedAt),
      changedBy: resolveChangedBy(entry.changedBy, params.managerMapping, params.defaultActorIdentityId),
      comment: entry.comment,
    }));

    const fields = {
      productType: productType as LeadProductType,
      stage,
      realtorStage,
      curatorStage,
      ownerPositionId,
      city: legacyLead.city,
      notes: legacyLead.notes,
      tags: legacyLead.tags,
      dealValue: legacyLead.dealValue,
      budgetValue: legacyLead.budgetValue,
      budgetCurrency: legacyLead.budgetCurrency,
      expectedCloseDate: legacyLead.expectedCloseDate,
      rejectionReason: legacyLead.rejectionReason,
      rejectionComment: legacyLead.rejectionComment,
    };

    if (params.dryRun) {
      const existing = await this.leadRepository.findByLegacyId(params.organizationId, legacyLead._id);
      return existing ? 'updated' : 'created';
    }

    return runInTransaction(this.connection, async (session) => {
      const contact = await this.resolveContact(params.organizationId, legacyLead, session);
      const existing = await this.leadRepository.findByLegacyId(params.organizationId, legacyLead._id, session);

      if (existing) {
        await this.leadRepository.updateFields(
          existing._id,
          params.organizationId,
          { ...fields, contactId: contact._id },
          session,
        );
        return 'updated';
      }

      const created = await this.leadRepository.createFromMigration(
        {
          organizationId: params.organizationId,
          contactId: contact._id,
          legacyId: legacyLead._id,
          source: { route: 'legacy-migration' },
          createdAt: new Date(legacyLead.createdAt),
          ...fields,
        },
        session,
      );

      for (const event of historyEvents) {
        await this.leadEventRepository.append(
          {
            leadId: created._id,
            organizationId: params.organizationId,
            stage: event.stage,
            changedBy: event.changedBy,
            comment: event.comment,
            changedAt: event.changedAt,
          },
          session,
        );
      }

      return 'created';
    });
  }

  /**
   * Tenant-local dedupe по телефону — тот же принцип, что
   * `CrmService.resolveContact` (недоступен напрямую, `private`), расширен
   * `email` (легаси-поле, которого нет в reveal-контуре). Найденный контакт
   * переиспользуется как есть, БЕЗ обновления name/email — тот же выбор, что
   * и у `CrmService.resolveContact`: дедуп, не merge.
   */
  private async resolveContact(
    organizationId: Types.ObjectId,
    legacyLead: LegacyLead,
    session: ClientSession,
  ) {
    const existing = await this.contactRepository.findByPhone(organizationId, legacyLead.phone);
    if (existing) {
      return existing;
    }
    return this.contactRepository.create(
      {
        organizationId,
        name: legacyLead.name,
        phone: legacyLead.phone,
        email: legacyLead.email,
        roles: ['buyer'],
      },
      session,
    );
  }
}

function validateProductType(raw: string): ProductType {
  if ((PRODUCT_TYPES as readonly string[]).includes(raw)) {
    return raw as ProductType;
  }
  throw new LegacyLeadValidationError(`Неизвестный productType легаси-лида: "${raw}"`);
}

function validateEnumValue<T extends readonly string[]>(raw: string, values: T, fieldName: string): T[number] {
  if ((values as readonly string[]).includes(raw)) {
    return raw as T[number];
  }
  throw new LegacyLeadValidationError(`Неизвестное значение "${raw}" для поля ${fieldName}`);
}

/**
 * legacyAccountId → positionId нового backend, ТОЛЬКО через явный
 * managerMapping (owner decision — не резолвится по имени/email, см.
 * LeadMigrationService докстринг). Пустая строка/отсутствие в mapping —
 * честный "не назначен", не ошибка.
 */
function resolvePositionId(
  legacyAccountId: string,
  managerMapping: Record<string, string>,
): Types.ObjectId | undefined {
  const mapped = managerMapping[legacyAccountId];
  if (!mapped) {
    return undefined;
  }
  return new Types.ObjectId(mapped);
}

function resolveChangedBy(
  legacyAccountId: string,
  managerMapping: Record<string, string>,
  defaultActorIdentityId: Types.ObjectId,
): LeadEventChangedBy {
  const positionId = resolvePositionId(legacyAccountId, managerMapping);
  if (positionId) {
    return { type: 'position', positionId };
  }
  return { type: 'identity', id: defaultActorIdentityId };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Не удалось перенести лид';
}
